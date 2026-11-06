"use client";

import { useEffect, useRef, useState } from "react";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import {
  clearPendingFamilyCollectionPreference,
  familyCollectionCommandFromSnapshot,
  persistPendingFamilyCollectionPreference,
  readPendingFamilyCollectionPreference,
  type FamilyCollectionPreferenceCommand,
} from "./owner-pending-family-collection-preference";

interface FamilyCollectionPreference {
  organizationId: string;
  familyId: string;
  requestedMode: "manual" | "automatic";
  effectiveMode: "manual";
  version: number;
  entitlementRevision: number | null;
  preferenceEntitlementRevision: number | null;
  automaticPreferenceAvailable: boolean;
  automaticProcessingEnabled: false;
  automaticStatus: "paid_plan_required" | "not_released";
  requiresConfirmation: boolean;
}

type FamilyCollectionCommand = FamilyCollectionPreferenceCommand;

function isRevision(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
}

function isMatchingPreferenceReceipt(
  value: unknown,
  command: FamilyCollectionCommand
): value is FamilyCollectionPreference {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<FamilyCollectionPreference>;
  return (
    receipt.organizationId === command.organizationId &&
    receipt.familyId === command.familyId &&
    receipt.requestedMode === command.mode &&
    receipt.effectiveMode === "manual" &&
    receipt.version === command.expectedVersion + 1 &&
    isRevision(receipt.entitlementRevision) &&
    isRevision(receipt.preferenceEntitlementRevision) &&
    receipt.automaticPreferenceAvailable === false &&
    receipt.automaticProcessingEnabled === false &&
    receipt.automaticStatus === "not_released" &&
    receipt.requiresConfirmation === false
  );
}

function isDefinitiveRejection(status: number, payload: unknown): boolean {
  if (status < 400 || status >= 500 || !payload || typeof payload !== "object") {
    return false;
  }
  const type = (payload as { type?: unknown }).type;
  if (typeof type !== "string") return false;
  const problemType = type.split("/").pop();
  return (
    (status === 400 && problemType === "invalid-family-collection-preference") ||
    (status === 409 &&
      [
        "version-conflict",
        "idempotency-conflict",
        "family-automatic-collection-disabled",
      ].includes(problemType ?? ""))
  );
}

export function FamilyCollectionModeCard({
  organizationId,
  familyId,
  canManage,
}: {
  organizationId: string;
  familyId: string;
  canManage: boolean;
}) {
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const writesBlocked = planPolicy.status !== "ready" || planPolicy.readOnly;
  const [preference, setPreference] =
    useState<FamilyCollectionPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingRecoveryStatus, setPendingRecoveryStatus] = useState<
    "checking" | "ready" | "invalid" | "unavailable"
  >("checking");
  const [pendingRecoveryMessage, setPendingRecoveryMessage] =
    useState<string | null>(null);
  const saveInFlight = useRef(false);
  const pendingCommandRef = useRef<FamilyCollectionCommand | null>(null);
  const [pendingCommand, setPendingCommand] =
    useState<FamilyCollectionCommand | null>(null);
  const currentScope = useRef({ organizationId, familyId });
  currentScope.current = { organizationId, familyId };
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) {
      setPendingRecoveryStatus("ready");
      setPendingRecoveryMessage(null);
      return;
    }

    const stored = readPendingFamilyCollectionPreference(window.sessionStorage);
    if (stored.status === "pending") {
      const restored = familyCollectionCommandFromSnapshot(stored.snapshot);
      pendingCommandRef.current = restored;
      setPendingCommand(restored);
      setPendingRecoveryStatus("ready");
      setPendingRecoveryMessage(null);
      return;
    }

    pendingCommandRef.current = null;
    setPendingCommand(null);
    if (stored.status === "invalid") {
      setPendingRecoveryStatus("invalid");
      setPendingRecoveryMessage(
        "Hay una solicitud local dañada. No se generarán cambios nuevos hasta recuperar su estado."
      );
      return;
    }
    if (stored.status === "unavailable") {
      setPendingRecoveryStatus("unavailable");
      setPendingRecoveryMessage(
        "No se pudo comprobar el almacenamiento de esta sesión. No se enviarán cambios nuevos hasta poder verificar una solicitud pendiente."
      );
      return;
    }
    setPendingRecoveryStatus("ready");
    setPendingRecoveryMessage(null);
  }, [canManage, familyId, organizationId]);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setPreference(null);
    setErrorMessage(null);
    setSavedMessage(null);
    const query = new URLSearchParams({ organizationId, familyId });
    void fetch(
      `/api/v1/owner/billing/family-collection-preference?${query.toString()}`,
      { signal: controller.signal, cache: "no-store" }
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
            | FamilyCollectionPreference
            | { detail?: string }
            | null;
        if (controller.signal.aborted) return;
        if (
          !response.ok ||
          !payload ||
          !("familyId" in payload) ||
          payload.organizationId !== organizationId ||
          payload.familyId !== familyId
        ) {
          throw new Error(
            payload && "detail" in payload
              ? payload.detail
              : "No se pudo consultar la preferencia de esta familia."
          );
        }
        setPreference(payload);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "No se pudo consultar la preferencia de esta familia."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canManage, familyId, organizationId]);

  async function sendPreference(command: FamilyCollectionCommand) {
    if (
      saveInFlight.current ||
      writesBlocked ||
      pendingRecoveryStatus !== "ready" ||
      pendingRecoveryMessage
    ) return;
    if (
      command.organizationId !== currentScope.current.organizationId ||
      command.familyId !== currentScope.current.familyId
    ) {
      return;
    }
    if (
      pendingCommandRef.current &&
      pendingCommandRef.current !== command
    ) {
      return;
    }

    if (!persistPendingFamilyCollectionPreference(window.sessionStorage, command)) {
      setPendingRecoveryStatus("invalid");
      setPendingRecoveryMessage(
        "No se pudo guardar y verificar esta solicitud en la sesión. No se enviará hasta poder recuperar el mismo comando."
      );
      return;
    }

    saveInFlight.current = true;
    pendingCommandRef.current = command;
    setPendingCommand(command);
    setSaving(true);
    setErrorMessage(null);
    setSavedMessage(null);
    try {
      const response = await fetch(
        "/api/v1/owner/billing/family-collection-preference",
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "idempotency-key": command.key,
          },
          body: command.body,
        }
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const rejected = isDefinitiveRejection(response.status, payload);
        const pendingCleared = rejected
          ? clearPendingFamilyCollectionPreference(window.sessionStorage, command)
          : false;
        if (pendingCleared && pendingCommandRef.current === command) {
          pendingCommandRef.current = null;
          setPendingCommand(null);
        }
        const detail =
          payload &&
          typeof payload === "object" &&
          "detail" in payload &&
          typeof payload.detail === "string"
            ? payload.detail
            : "No se pudo guardar. No sabemos si se aplicó la preferencia.";
        if (
          command.organizationId === currentScope.current.organizationId &&
          command.familyId === currentScope.current.familyId
        ) {
          setErrorMessage(
            rejected
              ? pendingCleared
                ? detail
                : `${detail} La solicitud seguirá guardada hasta verificar su limpieza; no se creará otra clave.`
              : `${detail} Reintenta la misma solicitud para recuperar su resultado.`
          );
        }
        return;
      }

      if (
        response.status !== 200 ||
        !isMatchingPreferenceReceipt(payload, command)
      ) {
        if (
          command.organizationId === currentScope.current.organizationId &&
          command.familyId === currentScope.current.familyId
        ) {
          setErrorMessage(
            "La respuesta no confirma esta preferencia. Reintenta la misma solicitud; no se enviará una nueva clave."
          );
        }
        return;
      }

      const pendingCleared = clearPendingFamilyCollectionPreference(
        window.sessionStorage,
        command
      );
      if (pendingCleared && pendingCommandRef.current === command) {
        pendingCommandRef.current = null;
        setPendingCommand(null);
      }
      if (
        command.organizationId === currentScope.current.organizationId &&
        command.familyId === currentScope.current.familyId
      ) {
        setPreference(payload);
        if (pendingCleared) {
          setSavedMessage(
            command.mode === "automatic"
              ? "Solicitud automática guardada; el cobro efectivo sigue siendo manual."
              : "Preferencia manual guardada para esta familia."
          );
        } else {
          setErrorMessage(
            "La preferencia se guardó, pero no se pudo limpiar la solicitud local. Reintenta la misma solicitud; no se enviará una clave nueva."
          );
        }
      }
    } catch (error) {
      if (
        command.organizationId === currentScope.current.organizationId &&
        command.familyId === currentScope.current.familyId
      ) {
        setErrorMessage(
          error instanceof Error
            ? `${error.message} Reintenta la misma solicitud para recuperar su resultado.`
            : "No se pudo confirmar el guardado. Reintenta la misma solicitud para recuperar su resultado."
        );
      }
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  async function chooseMode(mode: "manual" | "automatic") {
    if (
      saveInFlight.current ||
      pendingCommandRef.current ||
      !preference ||
      saving ||
      writesBlocked ||
      pendingRecoveryStatus !== "ready" ||
      pendingRecoveryMessage
    ) return;
    const currentMode = preference.requiresConfirmation
      ? "manual"
      : preference.requestedMode;
    if (mode === currentMode) return;
    if (mode === "automatic" && !preference.automaticPreferenceAvailable) return;

    const body = JSON.stringify({
      organizationId,
      familyId,
      mode,
      expectedVersion: preference.version,
    });
    void sendPreference({
      organizationId,
      familyId,
      mode,
      expectedVersion: preference.version,
      key: `family-preference-${crypto.randomUUID()}`,
      body,
    });
  }

  if (!canManage) {
    return (
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-600">
        La modalidad se configura por familia y requiere acceso a todas las
        sedes de la academia.
      </p>
    );
  }

  const selectedMode = preference?.requiresConfirmation
    ? "manual"
    : (preference?.requestedMode ?? "manual");
  const pendingCommandMatchesScope =
    pendingCommand?.organizationId === organizationId &&
    pendingCommand.familyId === familyId;

  return (
    <section
      aria-labelledby="family-collection-mode-title"
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <OwnerOperationalReadOnlyNotice organizationId={organizationId} />
      <div>
        <h3
          id="family-collection-mode-title"
          className="text-sm font-bold text-slate-900"
        >
          Cobro familiar: modalidad efectiva manual
        </h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          Puedes guardar una solicitud futura de cobro automático; aún no inicia
          cargos ni modifica los ya emitidos.
        </p>
      </div>

      {pendingCommand && !pendingCommandMatchesScope ? (
        <p
          className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950"
          role="alert"
        >
          Hay una solicitud pendiente para otra familia o academia. Vuelve a su
          contexto original para reintentarla; no enviaremos este cambio aquí.
        </p>
      ) : null}
      {pendingRecoveryMessage ? (
        <p
          className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm leading-5 text-red-900"
          role="alert"
        >
          {pendingRecoveryMessage}
        </p>
      ) : null}
      {pendingCommand && pendingCommandMatchesScope ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-950">
          <p>
            No se pudo confirmar la solicitud anterior. Puedes reintentarla con
            la misma clave y el mismo contenido.
          </p>
          <button
            type="button"
            disabled={
              saving || writesBlocked || pendingRecoveryStatus !== "ready"
            }
            onClick={() => void sendPreference(pendingCommand)}
            className="mt-2 min-h-11 rounded-full bg-amber-900 px-4 text-sm font-bold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Reintentando…" : "Reintentar solicitud pendiente"}
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-3 text-sm text-slate-600" role="status">
          Cargando preferencia…
        </p>
      ) : errorMessage && !preference ? (
        <p className="mt-3 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      ) : (
        <>
          <fieldset
            className="mt-3 grid gap-2 sm:grid-cols-2"
            disabled={
              saving ||
              writesBlocked ||
              pendingRecoveryStatus !== "ready" ||
              pendingRecoveryMessage !== null ||
              pendingCommand !== null
            }
          >
            <legend className="sr-only">Preferencia de cobro</legend>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <input
                checked={selectedMode === "manual"}
                className="size-4 accent-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
                name={`family-collection-mode-${familyId}`}
                onChange={() => void chooseMode("manual")}
                type="radio"
                value="manual"
              />
              <span className="text-sm font-semibold text-slate-900">
                Manual
              </span>
            </label>
            <label
              className={`flex min-h-12 items-center gap-3 rounded-xl border bg-white px-3 py-2 ${
                preference?.automaticPreferenceAvailable
                  ? "cursor-pointer border-slate-200"
                  : "cursor-not-allowed border-slate-200 opacity-70"
              }`}
            >
              <input
                checked={selectedMode === "automatic"}
                className="size-4 accent-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
                disabled={!preference?.automaticPreferenceAvailable}
                name={`family-collection-mode-${familyId}`}
                onChange={() => void chooseMode("automatic")}
                type="radio"
                value="automatic"
              />
              <span className="text-sm font-semibold text-slate-900">
                Solicitar automático
              </span>
            </label>
          </fieldset>

          {preference?.requiresConfirmation ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950">
              {preference.automaticPreferenceAvailable
                ? "La solicitud automática anterior dejó de ser válida al cambiar el plan. La familia sigue en modo manual; vuelve a solicitarla si quieres conservar esa preferencia futura."
                : "La solicitud automática anterior dejó de ser válida al cambiar el plan. La familia queda en modo manual; podrás volver a solicitarla con un plan de pago vigente."}
            </p>
          ) : null}
          {preference && !preference.automaticPreferenceAvailable ? (
            <p className="mt-2 text-xs leading-5 text-slate-600">
              La solicitud automática solo se puede guardar con un plan de pago
              vigente.
            </p>
          ) : null}
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
            La solicitud no autoriza al pagador ni inicia cobros. Activar esta
            modalidad requiere consentimiento, habilitar el procesamiento y
            completar sus pruebas de seguridad.
          </p>
        </>
      )}

      <div aria-live="polite" className="mt-2 min-h-5 text-xs">
        {saving ? <span className="text-slate-600">Guardando…</span> : null}
        {!saving && savedMessage ? (
          <span className="text-teal-900">{savedMessage}</span>
        ) : null}
        {!saving && errorMessage && preference ? (
          <span className="text-red-700" role="alert">
            {errorMessage}
          </span>
        ) : null}
      </div>
    </section>
  );
}
