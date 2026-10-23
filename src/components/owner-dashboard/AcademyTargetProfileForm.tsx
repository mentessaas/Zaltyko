"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Gauge, RotateCcw, WalletCards } from "lucide-react";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import {
  clearStoredHealthTargetCommand,
  isCanonicalHealthTargetRejection,
  persistHealthTargetCommand,
  readStoredHealthTargetCommand,
  validHealthTargetReceipt,
  type HealthScoreTargetKey,
  type StoredHealthTargetCommand,
} from "./owner-health-target-command";

const fields = [
  {
    key: "class_fill_rate",
    label: "Ocupación de plazas",
    help: "Plazas ocupadas frente a la capacidad efectiva de las sesiones.",
    group: "Programa y continuidad",
  },
  {
    key: "cohort_retention_rate",
    label: "Retención de inscripciones",
    help: "Proporción de la cohorte inicial que sigue activa al cierre.",
    group: "Programa y continuidad",
  },
  {
    key: "churn_rate",
    label: "Límite de bajas",
    help: "Umbral máximo deseado de bajas en la cohorte.",
    group: "Programa y continuidad",
  },
  {
    key: "collection_rate",
    label: "Cobro de vencimientos",
    help: "Proporción cobrada de los cargos vencidos en el período.",
    group: "Salud financiera",
  },
  {
    key: "attendance_coverage",
    label: "Asistencia registrada",
    help: "Sesiones elegibles con asistencia correctamente registrada.",
    group: "Salud operativa",
  },
] as const;

type TargetKey = HealthScoreTargetKey;
type Targets = Partial<Record<TargetKey, number>>;

export function AcademyTargetProfileForm({
  organizationId,
  profile,
}: {
  organizationId: string;
  profile: { version: number; targets: Record<string, number> } | null;
}) {
  const router = useRouter();
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const writesBlocked = planPolicy.status !== "ready" || planPolicy.readOnly;
  const formRef = useRef<HTMLFormElement | null>(null);
  const submitInFlight = useRef(false);
  const idempotencyKey = useRef<string | null>(null);
  const idempotencyKeyOrganizationId = useRef(organizationId);
  const uncertainCommand = useRef<StoredHealthTargetCommand | null>(null);
  const currentOrganizationId = useRef(organizationId);
  currentOrganizationId.current = organizationId;
  const [pending, setPending] = useState(false);
  const [pendingCommandOrganizationId, setPendingCommandOrganizationId] =
    useState<string | null>(null);
  const [retryRequired, setRetryRequired] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageIssue, setStorageIssue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedOrganizationId, setSavedOrganizationId] = useState<string | null>(
    null
  );
  const values = profile?.targets as Targets | undefined;

  useEffect(() => {
    if (currentOrganizationId.current !== organizationId) return;
    setStorageReady(false);
    setStorageIssue(null);
    setError(null);
    setSavedOrganizationId(null);
    setRetryRequired(false);
    uncertainCommand.current = null;
    idempotencyKey.current = null;
    idempotencyKeyOrganizationId.current = organizationId;

    try {
      const read = readStoredHealthTargetCommand(
        window.sessionStorage,
        organizationId
      );
      if (read.status === "unavailable" || read.status === "invalid") {
        setStorageIssue(
          "No se pudo recuperar de forma segura el estado de una solicitud anterior. No guardaremos metas nuevas desde esta sesión."
        );
      } else if (read.status === "pending") {
        uncertainCommand.current = read.command;
        idempotencyKey.current = read.command.key;
        idempotencyKeyOrganizationId.current = organizationId;
        setRetryRequired(true);
        setError(
          "Hay un guardado anterior cuyo resultado no se pudo confirmar. Reinténtalo para recuperar su resultado antes de editar las metas."
        );
        for (const field of fields) {
          const input = formRef.current?.elements.namedItem(field.key);
          if (input instanceof HTMLInputElement) {
            input.value = (read.command.targets[field.key] * 100).toFixed(1);
          }
        }
      }
    } catch {
      setStorageIssue(
        "El almacenamiento de esta pestaña no está disponible. No guardaremos metas nuevas sin poder recuperar una solicitud incierta."
      );
    } finally {
      setStorageReady(true);
    }
  }, [organizationId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitInFlight.current) return;
    submitInFlight.current = true;

    try {
      const formData = new FormData(event.currentTarget);
      if (writesBlocked || pending || !storageReady || storageIssue) return;

      const previous =
        uncertainCommand.current?.organizationId === organizationId
          ? uncertainCommand.current
          : null;
      const previouslyUncertain = previous !== null;
      const command: StoredHealthTargetCommand =
        previous ??
        (() => {
          const targets = Object.fromEntries(
            fields.map((field) => [
              field.key,
              Number(formData.get(field.key)) / 100,
            ])
          ) as Record<TargetKey, number>;
          return {
            organizationId,
            key:
              (idempotencyKeyOrganizationId.current === organizationId
                ? idempotencyKey.current
                : null) ?? crypto.randomUUID(),
            body: JSON.stringify({ organizationId, targets }),
            targets,
          };
        })();
      uncertainCommand.current = command;
      idempotencyKey.current = command.key;
      idempotencyKeyOrganizationId.current = command.organizationId;
      const ownsCurrentCommand = () => {
        const current = uncertainCommand.current;
        return (
          current !== null &&
          currentOrganizationId.current === command.organizationId &&
          current.organizationId === command.organizationId &&
          current.key === command.key &&
          current.body === command.body
        );
      };

      try {
        if (!persistHealthTargetCommand(window.sessionStorage, command)) {
          setStorageIssue(
            "No se pudo conservar la solicitud pendiente en esta pestaña. No se ha enviado; no edites ni reenvíes otra solicitud hasta resolverlo."
          );
          return;
        }
      } catch {
        setStorageIssue(
          "El almacenamiento de esta pestaña no está disponible. No se ha enviado la solicitud."
        );
        return;
      }

      setPendingCommandOrganizationId(command.organizationId);
      setPending(true);
      setError(null);
      setSavedOrganizationId(null);
      try {
        const response = await fetch("/api/v1/owner/health-score/targets", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": command.key,
          },
          body: command.body,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const commandWasCurrent = ownsCurrentCommand();
          const rejected = isCanonicalHealthTargetRejection(
            response.status,
            payload,
            previouslyUncertain
          );
          if (rejected) {
            if (clearStoredHealthTargetCommand(window.sessionStorage, command)) {
              if (commandWasCurrent) {
                uncertainCommand.current = null;
                idempotencyKey.current = null;
                idempotencyKeyOrganizationId.current = command.organizationId;
                setRetryRequired(false);
              }
            } else {
              if (commandWasCurrent) {
                setRetryRequired(true);
                setError(
                  "El servidor rechazó el guardado, pero no se pudo cerrar de forma segura la solicitud local. Reintenta el mismo envío."
                );
              }
              return;
            }
          }
          const detail =
            payload !== null &&
            typeof payload === "object" &&
            "detail" in payload &&
            typeof payload.detail === "string"
              ? payload.detail
              : "No se han podido guardar las metas.";
          if (commandWasCurrent) {
            setError(
              rejected
                ? detail
                : `${detail} Reintenta para confirmar el resultado; mantendremos bloqueadas las metas y reutilizaremos la misma solicitud.`
            );
            if (!rejected) setRetryRequired(true);
          }
          return;
        }

        if (
          response.status < 200 ||
          response.status >= 300 ||
          !validHealthTargetReceipt(payload)
        ) {
          if (ownsCurrentCommand()) {
            setRetryRequired(true);
            setError(
              "La respuesta no permite confirmar si se guardaron las metas. Reintenta para consultar el mismo envío; las metas seguirán bloqueadas."
            );
          }
          return;
        }

        if (!clearStoredHealthTargetCommand(window.sessionStorage, command)) {
          if (ownsCurrentCommand()) {
            setRetryRequired(true);
            setError(
              "El servidor confirmó el guardado, pero no se pudo cerrar de forma segura la solicitud local. Reintenta el mismo envío para confirmar y cerrar el estado pendiente."
            );
          }
          return;
        }

        if (ownsCurrentCommand()) {
          uncertainCommand.current = null;
          setRetryRequired(false);
          setSavedOrganizationId(command.organizationId);
          idempotencyKey.current = null;
          idempotencyKeyOrganizationId.current = command.organizationId;
          router.refresh();
        }
      } catch (cause) {
        if (ownsCurrentCommand()) {
          setRetryRequired(true);
          setError(
            cause instanceof Error
              ? cause.message
              : "No se han podido guardar las metas."
          );
        }
      } finally {
        setPending(false);
      }
    } finally {
      submitInFlight.current = false;
    }
  }

  const groups = [...new Set(fields.map((field) => field.group))];
  const savedForCurrentOrganization = savedOrganizationId === organizationId;
  const pendingForAnotherOrganization =
    pending &&
    pendingCommandOrganizationId !== null &&
    pendingCommandOrganizationId !== organizationId;
  const saveStatusMessage = pending
    ? pendingCommandOrganizationId === organizationId
      ? "Guardando metas de esta academia."
      : pendingCommandOrganizationId
        ? "Hay un guardado de otra academia en curso. Esta pantalla seguirá bloqueada hasta conocer su resultado."
        : ""
    : "";
  return (
    <>
      <form
        ref={formRef}
        onSubmit={submit}
        className="grid gap-8"
        aria-busy={pending}
      >
      <OwnerOperationalReadOnlyNotice organizationId={organizationId} />
      {groups.map((group) => (
        <section key={group} aria-labelledby={`group-${group}`}>
          <div className="mb-3 flex items-center gap-3 border-b border-slate-300 pb-3">
            {group === "Salud financiera" ? (
              <WalletCards
                className="h-5 w-5 text-teal-800"
                aria-hidden="true"
              />
            ) : (
              <Gauge className="h-5 w-5 text-teal-800" aria-hidden="true" />
            )}
            <h2
              id={`group-${group}`}
              className="font-display text-xl font-bold"
            >
              {group}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {fields
              .filter((field) => field.group === group)
              .map((field) => (
                <label
                  key={field.key}
                  className="grid content-start gap-2 border-l-2 border-teal-800/30 bg-white p-4"
                >
                  <span className="text-sm font-bold text-slate-900">
                    {field.label}
                  </span>
                  <span className="relative">
                    <input
                      name={field.key}
                      type="number"
                      disabled={
                        writesBlocked ||
                        pending ||
                        retryRequired ||
                        !storageReady ||
                        Boolean(storageIssue)
                      }
                      required
                      min="1"
                      max="100"
                      step="0.5"
                      defaultValue={
                        values?.[field.key] === undefined
                          ? ""
                          : (values[field.key]! * 100).toFixed(1)
                      }
                      inputMode="decimal"
                      aria-describedby={`${field.key}-help`}
                      className="touch-target w-full border border-slate-400 bg-[#FAFAF7] px-3 pr-10 font-mono text-lg text-slate-950 focus:border-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-800/30"
                    />
                    <span className="pointer-events-none absolute right-3 top-3 text-sm text-slate-500">
                      %
                    </span>
                  </span>
                  <span
                    id={`${field.key}-help`}
                    className="text-xs leading-5 text-slate-600"
                  >
                    {field.help}
                  </span>
                </label>
              ))}
          </div>
        </section>
      ))}
      <aside className="flex gap-3 border-l-4 border-amber-600 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <RotateCcw className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>
          Son metas internas que defines para tu academia. No son promedios del
          sector ni comparaciones con otras academias. Cambiarlas crea una nueva
          versión; las anteriores se conservan en el historial.
        </p>
      </aside>
      {error && (
        <p
          role="alert"
          className="border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
          {retryRequired &&
            " Reintenta para reenviar exactamente la misma solicitud; las metas están bloqueadas hasta confirmar el resultado."}
        </p>
      )}
      {storageIssue && (
        <p
          role="alert"
          className="border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {storageIssue}
        </p>
      )}
      {savedForCurrentOrganization && (
        <p
          aria-hidden="true"
          className="flex items-center gap-2 text-sm font-bold text-teal-900"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Metas guardadas. El score se actualizará al procesar la cola de
          métricas.
        </p>
      )}
      <button
        type="submit"
        disabled={
          pending || writesBlocked || !storageReady || Boolean(storageIssue)
        }
        className="touch-target inline-flex items-center justify-center gap-2 justify-self-start rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:bg-slate-500"
      >
        {pending
          ? pendingForAnotherOrganization
            ? "Esperando el guardado de otra academia…"
            : "Guardando metas…"
          : retryRequired
            ? "Reintentar el mismo envío"
            : profile
            ? `Guardar versión ${profile.version + 1}`
            : "Activar Academy Health Score"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
      </form>
      <p
        role="status"
        aria-label="Estado del guardado de metas"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {pending ? (
          saveStatusMessage
        ) : savedForCurrentOrganization ? (
          "Metas guardadas. El score se actualizará al procesar la cola de métricas."
        ) : null}
      </p>
    </>
  );
}
