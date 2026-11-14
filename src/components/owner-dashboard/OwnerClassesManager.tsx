"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, CalendarPlus, Clock, Info, Plus, Settings2, UsersRound, X } from "lucide-react";
import { ownerDisciplineOf, ownerDisciplineStyle, ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { useOrganizationDraftField } from "@/components/owner-dashboard/use-organization-draft-field";
import {
  clearPendingOwnerClassCreate,
  ownerClassCreateRejection,
  persistPendingOwnerClassCreate,
  readOwnerClassCreateReceipt,
  readPendingOwnerClassCreate,
  type PendingOwnerClassCreate,
} from "@/components/owner-dashboard/owner-class-command-response";
import { usePendingCommandExitWarning } from "@/components/owner-dashboard/use-pending-command-exit-warning";
import { OwnerOperationalReadOnlyNotice } from "@/components/owner-dashboard/OwnerOperationalReadOnlyNotice";
import { useOwnerPlanPolicy } from "@/components/owner-dashboard/owner-plan-usage-store";
import { ownerDashboardScopeHref } from "@/components/owner-dashboard/owner-dashboard-scope-url";
import { OwnerClassCoaches } from "@/components/owner-dashboard/OwnerClassCoaches";
import type { CoachRef } from "@/modules/coach-assignment/domain/coach-assignment";

const useCommittedLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type ClassesBundle = Awaited<
  ReturnType<
    typeof import("@/modules/scheduling/application/class-management-service").getOwnerClassesPageData
  >
>;

type ScheduleSlot = {
  id: string;
  isoWeekday: number;
  startsAtLocal: string;
  endsAtLocal: string;
};

type CreateClassBody = {
  organizationId: string;
  locationId: string;
  programId: string | null;
  name: string;
  capacity: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  schedule: Array<{
    isoWeekday: number;
    startsAtLocal: string;
    endsAtLocal: string;
  }>;
};

const weekdayOptions = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
];

const weekdayShortLabels = [
  "",
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
];

const fieldClassName = ownerUi.field;
const primaryButtonClassName = ownerUi.primaryButton;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function hasOverlappingSchedule(schedule: ScheduleSlot[]): boolean {
  return schedule.some((slot, index) =>
    schedule
      .slice(index + 1)
      .some(
        (next) =>
          slot.isoWeekday === next.isoWeekday &&
          slot.startsAtLocal < next.endsAtLocal &&
          next.startsAtLocal < slot.endsAtLocal
      )
  );
}

export function OwnerClassesManager({
  bundle,
  navigationLocationId,
  coachAssignment = null,
}: {
  bundle: ClassesBundle;
  navigationLocationId: string | null;
  /**
   * O1: titulares por clase. Null cuando el candidato SQL no está aplicado:
   * entonces la ficha de clase no muestra titulares ni el botón para asignarlos.
   */
  coachAssignment?: { titularsByClass: Record<string, CoachRef[]> } | null;
}) {
  const fieldIdPrefix = useId();
  const programSelectId = `${fieldIdPrefix}-program`;
  const programHelpId = `${fieldIdPrefix}-program-help`;
  const router = useRouter();
  const organizationId = bundle.organization.id;
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const writesAllowed = planPolicy.status === "ready" && !planPolicy.readOnly;
  const writesBlocked = !writesAllowed;
  const currentOrganizationRef = useRef(organizationId);
  useCommittedLayoutEffect(() => {
    currentOrganizationRef.current = organizationId;
  }, [organizationId]);
  const initialLocationId =
    bundle.selectedLocationId ?? bundle.locations[0]?.id ?? "";
  const [locationId, setLocationId] = useOrganizationDraftField(
    organizationId,
    initialLocationId
  );
  const [programId, setProgramId] = useOrganizationDraftField(
    organizationId,
    () => bundle.programs[0]?.id ?? ""
  );
  const [name, setName] = useOrganizationDraftField(organizationId, "");
  const [capacity, setCapacity] = useOrganizationDraftField(
    organizationId,
    "12"
  );
  const [effectiveFrom, setEffectiveFrom] = useOrganizationDraftField(
    organizationId,
    () => bundle.localTodayByLocation[initialLocationId] ?? ""
  );
  const [effectiveTo, setEffectiveTo] = useOrganizationDraftField(
    organizationId,
    ""
  );
  const [schedule, setSchedule] = useOrganizationDraftField<ScheduleSlot[]>(
    organizationId,
    () => [
      {
        id: "schedule-1",
        isoWeekday: 1,
        startsAtLocal: "17:00",
        endsAtLocal: "18:00",
      },
    ]
  );
  const [busy, setBusy] = useState(false);
  const createInFlightRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryRequest, setRetryRequest] = useState<PendingOwnerClassCreate | null>(null);
  const pendingRequestRef = useRef<PendingOwnerClassCreate | null>(null);
  const [pendingScopeLoadedFor, setPendingScopeLoadedFor] = useState<string | null>(null);
  const [pendingStorageError, setPendingStorageError] = useState("");
  const [blockedMarkerPersistenceFailed, setBlockedMarkerPersistenceFailed] = useState(false);
  usePendingCommandExitWarning(retryRequest !== null, pendingRequestRef);
  const nextSlotId = useRef(1);

  useEffect(() => {
    const result = readPendingOwnerClassCreate(organizationId);
    pendingRequestRef.current = result.status === "pending" ? result.command : null;
    setRetryRequest(result.status === "pending" ? result.command : null);
    setPendingStorageError(
      result.status === "invalid"
        ? "Hay una solicitud de clase pendiente que no se puede recuperar con seguridad. No se iniciará otra; solicita ayuda para revisar esta sesión."
        : result.status === "unavailable"
          ? "No se pudo comprobar la solicitud pendiente de esta academia. No se iniciará otra hasta recuperar el almacenamiento de sesión."
          : ""
    );
    setBlockedMarkerPersistenceFailed(false);
    setPendingScopeLoadedFor(organizationId);
    if (result.status === "pending") {
      const body = JSON.parse(result.command.body) as CreateClassBody;
      setLocationId(body.locationId);
      setProgramId(body.programId ?? "");
      setName(body.name);
      setCapacity(String(body.capacity));
      setEffectiveFrom(body.effectiveFrom);
      setEffectiveTo(body.effectiveTo ?? "");
      setSchedule(body.schedule.map((slot, index) => ({ id: `schedule-${index + 1}`, ...slot })));
    }
  }, [organizationId]);

  function setPendingRequest(command: PendingOwnerClassCreate | null) {
    pendingRequestRef.current = command;
    setRetryRequest(command);
  }

  function updateSchedule(slotId: string, patch: Partial<ScheduleSlot>) {
    setSchedule((current) =>
      current.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot))
    );
    if (retryRequest) setRetryRequest(null);
  }

  function changeLocation(nextLocationId: string) {
    const currentDefaultDate = bundle.localTodayByLocation[locationId] ?? "";
    setLocationId(nextLocationId);
    if (!effectiveFrom || effectiveFrom === currentDefaultDate) {
      setEffectiveFrom(bundle.localTodayByLocation[nextLocationId] ?? "");
    }
  }

  async function sendCreate(command: PendingOwnerClassCreate) {
    if (
      createInFlightRef.current ||
      command.organizationId !== currentOrganizationRef.current ||
      command.blocked
    ) return;
    createInFlightRef.current = true;
    if (!persistPendingOwnerClassCreate(command)) {
      setError("No se pudo guardar la solicitud pendiente en esta sesión. No se ha enviado; inténtalo de nuevo cuando el almacenamiento esté disponible.");
      createInFlightRef.current = false;
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setPendingRequest(command);
    try {
      const response = await fetch("/api/v1/owner/classes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": command.key,
        },
        body: command.body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const outcome = ownerClassCreateRejection(response, payload, command.previouslyUncertain);
        if (outcome.status === "blocked") {
          const blockedCommand = { ...command, previouslyUncertain: true, blocked: true };
          setBlockedMarkerPersistenceFailed(
            !persistPendingOwnerClassCreate(blockedCommand)
          );
          if (currentOrganizationRef.current === command.organizationId) {
            setPendingRequest(blockedCommand);
            setError(outcome.message);
          }
        } else if (outcome.status === "rejected") {
          clearPendingOwnerClassCreate(command.organizationId);
          if (currentOrganizationRef.current === command.organizationId) setPendingRequest(null);
        } else {
          const uncertainCommand = { ...command, previouslyUncertain: true, blocked: false };
          if (currentOrganizationRef.current === command.organizationId) setPendingRequest(uncertainCommand);
        }
        if (currentOrganizationRef.current === command.organizationId) setError(outcome.message);
        return;
      }

      const expectedBody = JSON.parse(command.body) as CreateClassBody;
      const created = readOwnerClassCreateReceipt(payload, expectedBody.name);
      if (!created) {
        const uncertainCommand = { ...command, previouslyUncertain: true, blocked: false };
        if (currentOrganizationRef.current === command.organizationId) {
          setPendingRequest(uncertainCommand);
          setError("No sabemos si se guardó. El acuse no coincide con esta clase; reintenta este mismo envío para comprobar el resultado.");
        }
        return;
      }

      clearPendingOwnerClassCreate(command.organizationId);
      if (currentOrganizationRef.current === command.organizationId) {
        setPendingRequest(null);
        setName("");
        setEffectiveTo("");
        setNotice(
          `Clase creada con ${created.sessionCount} sesiones preparadas hasta el ${formatDate(created.generatedThrough)}.`
        );
        router.refresh();
      }
    } catch {
      const uncertainCommand = { ...command, previouslyUncertain: true, blocked: false };
      if (currentOrganizationRef.current === command.organizationId) {
        setPendingRequest(uncertainCommand);
        setError("No sabemos si se guardó. Reintenta este mismo envío; conservaremos el cuerpo y la clave para evitar duplicados.");
      }
    } finally {
      createInFlightRef.current = false;
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (retryRequest) {
      if (retryRequest.organizationId === organizationId) void sendCreate(retryRequest);
      return;
    }
    if (writesBlocked) return;
    if (pendingScopeLoadedFor !== organizationId || pendingStorageError) return;
    setError("");
    setNotice("");

    if (
      !bundle.locations.some((location) => location.id === locationId) ||
      !bundle.programs.some((program) => program.id === programId)
    ) {
      setError(
        "La actividad o la sede ya no pertenecen a esta academia. Vuelve a elegirlas."
      );
      return;
    }

    const parsedCapacity = Number(capacity);
    if (
      !locationId ||
      !programId ||
      name.trim().length < 2 ||
      !Number.isInteger(parsedCapacity) ||
      parsedCapacity < 1 ||
      !effectiveFrom ||
      hasOverlappingSchedule(schedule) ||
      schedule.some(
        (slot) =>
          !slot.startsAtLocal ||
          !slot.endsAtLocal ||
          slot.endsAtLocal <= slot.startsAtLocal
      )
    ) {
      setError(
        hasOverlappingSchedule(schedule)
          ? "No superpongas dos horarios del mismo día."
          : "Revisa la actividad, la sede y los datos de la clase."
      );
      return;
    }

    const body: CreateClassBody = {
      organizationId,
      locationId,
      programId,
      name: name.trim(),
      capacity: parsedCapacity,
      effectiveFrom,
      effectiveTo: effectiveTo || null,
      schedule: schedule.map(({ isoWeekday, startsAtLocal, endsAtLocal }) => ({
        isoWeekday,
        startsAtLocal,
        endsAtLocal,
      })),
    };
    void sendCreate({
      version: 1,
      organizationId,
      key: `owner-class:${crypto.randomUUID()}`,
      body: JSON.stringify(body),
      previouslyUncertain: false,
      blocked: false,
    });
  }

  const pendingForCurrentOrganization = retryRequest?.organizationId === organizationId ? retryRequest : null;
  const formLocked = busy || retryRequest !== null || pendingScopeLoadedFor !== organizationId || pendingStorageError !== "" || writesBlocked;
  const canCreate = bundle.locations.length > 0 && bundle.programs.length > 0;

  return (
    <main className={ownerUi.page}>
      <Link
        href={ownerDashboardScopeHref(
          "/owner",
          bundle.organization.id,
          navigationLocationId
        )}
        className={ownerUi.backLink}
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Volver al resumen</span>
      </Link>
      <PageHeader
        title="Clases recurrentes"
        description="Indica el horario y las plazas una sola vez. Zaltyko prepara el calendario de sesiones por ti."
        className={`${ownerUi.pageHeader} mt-3`}
        actions={
          <Link
            href={ownerDashboardScopeHref(
              "/owner/groups",
              bundle.organization.id,
              navigationLocationId
            )}
            className={ownerUi.secondaryButton}
          >
            <UsersRound className="h-4 w-4 shrink-0" aria-hidden="true" />
            Grupos <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        }
      />

      <OwnerOperationalReadOnlyNotice organizationId={organizationId} />

      {notice && (
        <p
          role="status"
          aria-live="polite"
          className={`mb-5 ${ownerUi.noticeInfo}`}
        >
          {notice}
        </p>
      )}

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className={`mb-5 ${ownerUi.noticeError}`}
        >
          {error}
        </p>
      )}

      {pendingStorageError && (
        <p role="alert" aria-live="assertive" className={`mb-5 ${ownerUi.noticeError}`}>
          {pendingStorageError}
        </p>
      )}

      {retryRequest && !pendingForCurrentOrganization && (
        <p role="status" className={`mb-5 ${ownerTone.noticeWarning}`}>
          Hay una creación pendiente en otra academia. Vuelve a esa academia para resolverla antes de iniciar otra.
        </p>
      )}

      {pendingForCurrentOrganization?.blocked && (
        <section className={`mb-5 ${ownerTone.noticeWarning}`} aria-label="Creación bloqueada por conflicto">
          <p role="status">
            {blockedMarkerPersistenceFailed
              ? "No volveremos a enviar esta creación en esta pantalla. No se pudo guardar la marca de bloqueo; no recargues ni cierres esta pestaña y no inicies otra clase hasta que soporte revise el resultado. Este bloqueo podría no conservarse al recargar."
              : "No volveremos a enviar esta creación. Recarga la lista para comprobar si la clase aparece; si no aparece o el resultado no está claro, contacta con soporte antes de iniciar otra."}
          </p>
          <Link href="/contact?type=support" className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            Contactar con soporte
          </Link>
        </section>
      )}

      {!canCreate ? (
        <section className={ownerUi.card}>
          <div className="flex items-start gap-3 sm:gap-4">
            <span aria-hidden="true" className={ownerUi.iconTile}>
              <Settings2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className={ownerUi.cardTitle}>
                Falta un dato para crear clases
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-z-soft">
                {bundle.locations.length === 0
                  ? "No hay sedes activas a las que tengas acceso."
                  : "Antes configura una actividad de la academia, como gimnasia artística, rítmica o una actividad complementaria."}
              </p>
              <Link
                href={`/owner/setup?organizationId=${bundle.organization.id}`}
                className={`${primaryButtonClassName} mt-5`}
              >
                Revisar configuración
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:gap-10">
          <form
            onSubmit={submit}
            aria-label="Crear clase recurrente"
            className={`${ownerUi.card} grid min-w-0 gap-6 self-start`}
          >
            <div className="flex items-start gap-3 sm:gap-4">
              <span aria-hidden="true" className={ownerUi.iconTile}>
                <CalendarPlus className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className={ownerUi.cardTitle}>
                  Crear una clase
                </h2>
                <p className="mt-1 text-sm leading-6 text-z-soft">
                  Elige actividad, horario y plazas. Los grupos y las
                  inscripciones se gestionan aparte.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <label
                htmlFor={programSelectId}
                className={ownerUi.label}
              >
                Actividad
              </label>
              <select
                id={programSelectId}
                value={programId}
                onChange={(event) => setProgramId(event.target.value)}
                disabled={formLocked}
                required
                aria-describedby={programHelpId}
                className={fieldClassName}
              >
                {bundle.programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
              <span
                id={programHelpId}
                className={ownerUi.help}
              >
                Incluye gimnasia artística, rítmica y las actividades
                complementarias configuradas.
              </span>
            </div>

            {bundle.locations.length > 1 && (
              <label className="grid gap-2">
                <span className={ownerUi.label}>Sede</span>
                <select
                  value={locationId}
                  onChange={(event) => changeLocation(event.target.value)}
                  disabled={formLocked}
                  required
                  className={fieldClassName}
                >
                  {bundle.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="grid gap-2">
              <span className={ownerUi.label}>
                Nombre de la clase
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={formLocked}
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                className={fieldClassName}
              />
            </label>

            <label className="grid gap-2 sm:max-w-xs">
              <span className={ownerUi.label}>
                Plazas disponibles
              </span>
              <input
                type="number"
                min={1}
                max={5000}
                step={1}
                inputMode="numeric"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                disabled={formLocked}
                required
                className={fieldClassName}
              />
            </label>

            <fieldset className="grid min-w-0 gap-3 border-t border-z-line pt-6">
              <legend className={`${ownerUi.label} flex items-center gap-2 pr-2`}>
                <Clock className="h-4 w-4 shrink-0 text-z-brand-600" aria-hidden="true" />
                Horario semanal
              </legend>
              {schedule.map((slot, index) => (
                <div
                  key={slot.id}
                  className={`${ownerUi.subtlePanel} grid min-w-0 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end`}
                >
                  <label className="grid gap-2">
                    <span className={ownerUi.smallLabel}>
                      Día {index + 1}
                    </span>
                    <select
                      value={slot.isoWeekday}
                      onChange={(event) =>
                        updateSchedule(slot.id, {
                          isoWeekday: Number(event.target.value),
                        })
                      }
                      disabled={formLocked}
                      className={fieldClassName}
                    >
                      {weekdayOptions.map((weekday) => (
                        <option key={weekday.value} value={weekday.value}>
                          {weekday.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className={ownerUi.smallLabel}>
                      Empieza
                    </span>
                    <input
                      type="time"
                      value={slot.startsAtLocal}
                      onChange={(event) =>
                        updateSchedule(slot.id, {
                          startsAtLocal: event.target.value,
                        })
                      }
                      disabled={formLocked}
                      required
                      className={fieldClassName}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className={ownerUi.smallLabel}>
                      Termina
                    </span>
                    <input
                      type="time"
                      value={slot.endsAtLocal}
                      onChange={(event) =>
                        updateSchedule(slot.id, {
                          endsAtLocal: event.target.value,
                        })
                      }
                      disabled={formLocked}
                      required
                      className={fieldClassName}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Eliminar horario ${weekdayOptions.find((day) => day.value === slot.isoWeekday)?.label ?? "semanal"}`}
                    onClick={() =>
                      setSchedule((current) =>
                        current.length > 1
                          ? current.filter((item) => item.id !== slot.id)
                          : current
                      )
                    }
                    disabled={formLocked || schedule.length === 1}
                    className={ownerUi.iconButton}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  nextSlotId.current += 1;
                  setSchedule((current) => [
                    ...current,
                    {
                      id: `schedule-${nextSlotId.current}`,
                      isoWeekday: 2,
                      startsAtLocal: "17:00",
                      endsAtLocal: "18:00",
                    },
                  ]);
                }}
                disabled={formLocked || schedule.length >= 14}
                className={`${ownerUi.secondaryButton} w-fit`}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Añadir otro horario
              </button>
            </fieldset>

            <div className="grid gap-4 border-t border-z-line pt-6 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className={ownerUi.label}>
                  Empieza el
                </span>
                <input
                  type="date"
                  value={effectiveFrom}
                  min={bundle.localTodayByLocation[locationId]}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  disabled={formLocked}
                  required
                  className={fieldClassName}
                />
              </label>
              <label className="grid gap-2">
                <span className={ownerUi.label}>
                  Último día (opcional)
                </span>
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={(event) => setEffectiveTo(event.target.value)}
                  disabled={formLocked}
                  min={effectiveFrom}
                  className={fieldClassName}
                />
              </label>
            </div>

            <p className="flex items-start gap-2.5 rounded-md bg-z-canvas px-4 py-3 text-sm leading-6 text-z-soft">
              <Info className="mt-1 h-4 w-4 shrink-0 text-z-brand-600" aria-hidden="true" />
              <span>
                Al guardar se crean la clase recurrente y sus sesiones de hasta
                los próximos 120 días. No se crean inscripciones ni cobros.
              </span>
            </p>

            <button
              type="submit"
              disabled={busy || !canCreate || pendingScopeLoadedFor !== organizationId || pendingStorageError !== "" || (retryRequest !== null && !pendingForCurrentOrganization) || pendingForCurrentOrganization?.blocked === true || (writesBlocked && !pendingForCurrentOrganization)}
              className={primaryButtonClassName}
            >
              {busy
                ? "Guardando…"
                : pendingForCurrentOrganization?.blocked
                  ? "Revisión de soporte necesaria"
                  : pendingForCurrentOrganization
                  ? "Reintentar el mismo envío"
                  : retryRequest
                    ? "Operación pendiente en otra academia"
                    : pendingScopeLoadedFor !== organizationId
                      ? "Comprobando solicitudes…"
                      : "Crear clase y sesiones"}
            </button>
          </form>

          <section aria-labelledby="classes-list-title" className="min-w-0">
            <h2
              id="classes-list-title"
              className={ownerUi.sectionTitle}
            >
              Clases de tu academia
            </h2>
            <p className={`mt-1 ${ownerUi.muted}`}>
              Las sesiones se generan según la zona horaria de cada sede.
            </p>
            {bundle.classes.length === 0 ? (
              <div className={`mt-5 ${ownerUi.emptyState}`}>
                <span aria-hidden="true" className={ownerUi.emptyIcon}>
                  <CalendarDays className="h-6 w-6" />
                </span>
                <p className="max-w-md text-sm leading-6 text-z-soft">
                  Aún no hay clases recurrentes. Crea la primera para organizar
                  sus sesiones y preparar el calendario.
                </p>
              </div>
            ) : (
              <ul className="mt-5 divide-y divide-z-line border-y border-z-line border-t-[3px] border-t-z-ink">
                {bundle.classes.map((classItem) => (
                  <li key={classItem.id} className="py-4 sm:py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${ownerDisciplineStyle[ownerDisciplineOf(classItem.programName)].tile}`}
                        >
                          <CalendarDays className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="break-words font-semibold text-z-ink">
                            {classItem.name}
                          </h3>
                          <p className="mt-0.5 break-words text-xs text-z-soft">
                            {classItem.programName ?? "Actividad sin clasificar"}{" "}
                            · {classItem.locationName}
                          </p>
                        </div>
                      </div>
                      <span className={`${ownerUi.chipAccent} shrink-0`}>
                        {classItem.capacity} plazas
                      </span>
                    </div>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {classItem.schedule.map((slot) => (
                        <li
                          key={`${slot.isoWeekday}-${slot.startsAtLocal}`}
                          className={ownerUi.chip}
                        >
                          {weekdayShortLabels[slot.isoWeekday]} ·{" "}
                          {slot.startsAtLocal.slice(0, 5)}–
                          {slot.endsAtLocal.slice(0, 5)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs leading-5 text-z-soft">
                      Desde {formatDate(classItem.effectiveFrom)}
                      {classItem.effectiveTo
                        ? ` hasta ${formatDate(classItem.effectiveTo)}`
                        : " · sin fecha de fin"}
                    </p>
                    {coachAssignment ? (
                      <OwnerClassCoaches
                        organizationId={organizationId}
                        locationId={classItem.locationId}
                        classTemplateId={classItem.id}
                        className={classItem.name}
                        initialTitulars={coachAssignment.titularsByClass[classItem.id] ?? []}
                        writesBlocked={writesBlocked}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
