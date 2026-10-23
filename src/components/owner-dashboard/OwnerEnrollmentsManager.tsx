"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePendingCommandExitWarning } from "./use-pending-command-exit-warning";
import { useOrganizationDraftField } from "./use-organization-draft-field";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import { ArrowLeft, UserPlus } from "lucide-react";

import { OwnerEnrollmentCreateForm } from "./OwnerEnrollmentCreateForm";
import { OwnerEnrollmentList } from "./OwnerEnrollmentList";
import { enrollmentCandidates, enrollmentLookupError, enrollmentPricePlans } from "./owner-enrollment-lookups";
import {
  clearPendingEnrollmentIntent,
  enrollmentCommandOutcome,
  persistPendingEnrollmentIntent,
  readPendingEnrollmentIntent,
  type PendingEnrollmentIntent,
} from "./owner-enrollment-command-response";
import { primaryButtonClassName, statusHref } from "./owner-enrollment-ui";
import {
  constrainEnrollmentStartDate,
  isEnrollmentStartDateAllowed,
} from "./owner-enrollment-date";
import type {
  Candidate,
  ChangeableStatus,
  EnrollmentBundle,
  PricePlanOption,
  StatusFilter,
} from "./owner-enrollment-types";

export function OwnerEnrollmentsManager({
  bundle,
  selectedStatus,
  previewMode = false,
  previewCreateForm = false,
}: {
  bundle: EnrollmentBundle;
  selectedStatus: StatusFilter;
  previewMode?: boolean;
  previewCreateForm?: boolean;
}) {
  const router = useRouter();
  const organizationId = bundle.organization.id;
  const planPolicy = useOwnerPlanPolicy(organizationId, !previewMode);
  const writesAllowed = planPolicy.status === "ready" && !planPolicy.readOnly;
  const writesBlocked = !writesAllowed;
  const [createOpen, setCreateOpen] = useOrganizationDraftField(organizationId,
    previewCreateForm || (!previewMode && bundle.enrollments.length === 0)
  );
  const [createLocationId, setCreateLocationId] = useOrganizationDraftField(organizationId,
    bundle.selectedLocationId ?? bundle.locations[0]?.id ?? ""
  );
  const [classTemplateId, setClassTemplateId] = useOrganizationDraftField(organizationId,
    previewCreateForm ? (bundle.classes[0]?.id ?? "") : ""
  );
  const initialSelectedClass = bundle.classes.find(
    (classItem) =>
      classItem.id === classTemplateId &&
      classItem.locationId === createLocationId
  );
  const [candidateQuery, setCandidateQuery] = useOrganizationDraftField(organizationId, "");
  const [candidates, setCandidates] = useOrganizationDraftField<Candidate[]>(organizationId, []);
  const [selectedCandidate, setSelectedCandidate] = useOrganizationDraftField<Candidate | null>(organizationId,
    previewCreateForm
      ? {
          id: "20000000-0000-0000-0000-000000000071",
          name: "Gimnasta Ejemplo A",
        }
      : null
  );
  const [candidateLoading, setCandidateLoading] = useOrganizationDraftField(organizationId, false);
  const [candidateError, setCandidateError] = useOrganizationDraftField(organizationId, "");
  const [candidateNotice, setCandidateNotice] = useOrganizationDraftField(organizationId, "");
  const [startsOn, setStartsOn] = useOrganizationDraftField(organizationId, () => {
    const localToday = bundle.localTodayByLocation[createLocationId] ?? "";
    return initialSelectedClass
      ? constrainEnrollmentStartDate(localToday, initialSelectedClass)
      : localToday;
  });
  const [pricePlans, setPricePlans] = useOrganizationDraftField<PricePlanOption[]>(organizationId, []);
  const [pricePlansLoading, setPricePlansLoading] = useOrganizationDraftField(organizationId, false);
  const [pricePlansError, setPricePlansError] = useOrganizationDraftField(organizationId, "");
  // null means not initialized; "" records no tariff, including an explicit choice.
  const [pricePlanId, setPricePlanId] = useOrganizationDraftField<string | null>(organizationId, null);
  const [candidateRetry, setCandidateRetry] = useOrganizationDraftField(organizationId, 0);
  const [pricePlansRetry, setPricePlansRetry] = useOrganizationDraftField(organizationId, 0);
  const [busyId, setBusyId] = useState("");
  const [busyCreate, setBusyCreate] = useState(false);
  const [confirmingCancelId, setConfirmingCancelId] = useOrganizationDraftField(organizationId, "");
  const [confirmingCompleteId, setConfirmingCompleteId] = useOrganizationDraftField(organizationId, "");
  const [error, setError] = useOrganizationDraftField(organizationId, "");
  const [notice, setNotice] = useOrganizationDraftField(organizationId, "");
  const currentOrganizationIdRef = useRef(organizationId);
  currentOrganizationIdRef.current = organizationId;
  const pendingIntentRef = useRef<PendingEnrollmentIntent | null>(null);
  const uncertainIntentRef = useRef(false);
  const sendingRef = useRef(false);
  const [pendingIntent, setPendingIntent] = useState<PendingEnrollmentIntent | null>(null);
  const [pendingScopeLoadedFor, setPendingScopeLoadedFor] = useState<string | null>(null);
  const [pendingStorageError, setPendingStorageError] = useState("");
  const [pendingStorageFailureKind, setPendingStorageFailureKind] = useState<"read" | "write" | null>(null);
  const [pendingIntentReadAttempt, setPendingIntentReadAttempt] = useState(0);
  usePendingCommandExitWarning(pendingIntent !== null, pendingIntentRef);
  const retryButtonRef = useRef<HTMLButtonElement | null>(null);
  const commandsLocked = pendingIntent !== null || busyCreate || busyId !== "" ||
    (!previewMode && (pendingScopeLoadedFor !== organizationId || pendingStorageError !== ""));
  const classesForLocation = bundle.classes.filter(
    (classItem) => classItem.locationId === createLocationId
  );
  const selectedClass = classesForLocation.find(
    (classItem) => classItem.id === classTemplateId
  );
  const participantLabel =
    selectedClass?.programKind === "gymnastics_sport"
      ? "Gimnasta"
      : selectedClass
        ? "Participante"
        : "Gimnasta o participante";
  const createToday = bundle.localTodayByLocation[createLocationId] ?? "";
  const pricePlanUnavailable = pricePlanId !== null && pricePlanId !== "" &&
    !pricePlansLoading && !pricePlansError && !pricePlans.some(plan => plan.id === pricePlanId);

  useEffect(() => {
    if (pendingIntent?.organizationId === organizationId && !busyCreate && !busyId) retryButtonRef.current?.focus();
  }, [pendingIntent, organizationId, busyCreate, busyId]);

  useEffect(() => {
    if (previewMode) return;
    // Do not mark the new academy as checked while another academy's request
    // is still in flight. Its completion will trigger a fresh read for this scope.
    if (sendingRef.current) {
      setPendingScopeLoadedFor(null);
      return;
    }
    const previousIntent = pendingIntentRef.current;
    const result = readPendingEnrollmentIntent(organizationId);
    if (result.status === "pending") {
      pendingIntentRef.current = result.intent;
      uncertainIntentRef.current = true;
      setPendingIntent(result.intent);
      setPendingStorageError("");
      setPendingStorageFailureKind(null);
    } else if (result.status === "empty") {
      const otherAcademyIntent = previousIntent &&
        previousIntent.organizationId !== organizationId
        ? readPendingEnrollmentIntent(previousIntent.organizationId)
        : null;
      if (otherAcademyIntent?.status === "pending") {
        pendingIntentRef.current = otherAcademyIntent.intent;
        uncertainIntentRef.current = true;
        setPendingIntent(otherAcademyIntent.intent);
        setPendingStorageError("");
        setPendingStorageFailureKind(null);
      } else if (otherAcademyIntent?.status === "unavailable" || otherAcademyIntent?.status === "invalid") {
        pendingIntentRef.current = previousIntent;
        setPendingIntent(previousIntent);
        setPendingStorageError("No se pudo comprobar la operación pendiente de otra academia. No se iniciarán más escrituras hasta poder recuperarla.");
        setPendingStorageFailureKind(otherAcademyIntent.status === "unavailable" ? "read" : null);
      } else {
        pendingIntentRef.current = null;
        uncertainIntentRef.current = false;
        setPendingIntent(null);
        setPendingStorageError("");
        setPendingStorageFailureKind(null);
      }
    } else {
      pendingIntentRef.current = null;
      uncertainIntentRef.current = false;
      setPendingIntent(null);
      setPendingStorageError(result.status === "unavailable"
        ? "No se pudo leer el almacenamiento de sesión. No se enviará ni sobrescribirá ninguna operación hasta poder comprobar si hay una inscripción pendiente."
        : "Hay una operación anterior que no se puede validar con seguridad. No se enviará ni sobrescribirá ninguna inscripción; contacta con soporte para revisarla.");
      setPendingStorageFailureKind(result.status === "unavailable" ? "read" : null);
    }
    setPendingScopeLoadedFor(organizationId);
    // sessionStorage is read after hydration to preserve server/client markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [organizationId, pendingIntentReadAttempt, previewMode]);

  useEffect(() => {
    if (previewMode || !createOpen || !createLocationId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      organizationId,
      locationId: createLocationId,
    });
    void (async () => {
      setPricePlansLoading(true);
      setPricePlansError("");
      setPricePlans([]);
      try {
        const response = await fetch(
          `/api/v1/owner/price-plans/options?${params.toString()}`,
          { cache: "no-store", signal: controller.signal }
        );
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        const items = enrollmentPricePlans(payload, { organizationId, locationId: createLocationId });
        if (!response.ok || !items) {
          throw new Error(enrollmentLookupError(payload, "No se pudieron cargar las tarifas mensuales."));
        }
        setPricePlans(items);
        setPricePlanId(current => current === null ? (items[0]?.id ?? "") : current);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setPricePlans([]);
          setPricePlansError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar las tarifas mensuales."
          );
        }
      } finally {
        if (!controller.signal.aborted) setPricePlansLoading(false);
      }
    })();
    return () => controller.abort();
  }, [createLocationId, createOpen, organizationId, previewMode, pricePlansRetry, setPricePlansLoading, setPricePlansError, setPricePlans, setPricePlanId]);

  useEffect(() => {
    if (
      previewMode ||
      !createOpen ||
      selectedCandidate ||
      candidateQuery.trim().length < 2 ||
      !createLocationId ||
      !classTemplateId
    ) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCandidateLoading(true);
      setCandidateError("");
      setCandidateNotice("");
      try {
        const params = new URLSearchParams({
          organizationId,
          locationId: createLocationId,
          classTemplateId,
          q: candidateQuery.trim(),
        });
        const response = await fetch(
          "/api/v1/owner/enrollments?" + params.toString(),
          { cache: "no-store", signal: controller.signal }
        );
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        const items = enrollmentCandidates(payload);
        if (!response.ok || !items) {
          setCandidates([]);
          setCandidateError(enrollmentLookupError(payload, "No se pudo buscar. Comprueba la conexión e inténtalo de nuevo."));
          return;
        }
        setCandidates(items);
        if (items.length === 0) {
          setCandidateNotice(
            "No hay coincidencias en esta sede. Si falta la ficha, créala desde Grupos."
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          setCandidates([]);
          setCandidateError(
            "No se pudo buscar. Comprueba la conexión e inténtalo de nuevo."
          );
        }
      } finally {
        if (!controller.signal.aborted) setCandidateLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    createOpen,
    candidateQuery,
    classTemplateId,
    createLocationId,
    organizationId,
    previewMode,
    selectedCandidate,
    candidateRetry,
    setCandidateLoading,
    setCandidateError,
    setCandidateNotice,
    setCandidates,
  ]);

  function toggleCreateForm() {
    if (pendingIntentRef.current || sendingRef.current) return;
    setCreateOpen(open => !open);
    if (createOpen) {
      setCandidates([]);
      setCandidateLoading(false);
      setCandidateError("");
      setCandidateNotice("");
    }
  }

  function changeCreateLocation(nextLocationId: string) {
    setCreateLocationId(nextLocationId);
    setClassTemplateId("");
    setSelectedCandidate(null);
    setCandidateQuery("");
    setCandidates([]);
    setCandidateLoading(false);
    setCandidateError("");
    setCandidateNotice("");
    setStartsOn(bundle.localTodayByLocation[nextLocationId] ?? "");
    setPricePlans([]);
    setPricePlansError("");
    setPricePlansLoading(true);
    setPricePlanId(null);
  }

  function changeCandidateQuery(value: string) {
    setCandidateQuery(value);
    setCandidates([]);
    setCandidateLoading(false);
    setCandidateError("");
    setCandidateNotice("");
  }

  function changeClassTemplate(nextClassTemplateId: string) {
    setClassTemplateId(nextClassTemplateId);
    setSelectedCandidate(null);
    setCandidateQuery("");
    setCandidates([]);
    setCandidateLoading(false);
    setCandidateError("");
    setCandidateNotice("");
    const nextClass = classesForLocation.find(
      (classItem) => classItem.id === nextClassTemplateId
    );
    setStartsOn((current) => {
      const preferredDate = current || createToday;
      return nextClass
        ? constrainEnrollmentStartDate(preferredDate, nextClass)
        : preferredDate;
    });
  }

  function confirmCancel(enrollmentId: string) {
    if (pendingIntentRef.current || sendingRef.current) return;
    setConfirmingCancelId(enrollmentId);
    if (enrollmentId) setConfirmingCompleteId("");
  }

  function confirmComplete(enrollmentId: string) {
    if (pendingIntentRef.current || sendingRef.current) return;
    setConfirmingCompleteId(enrollmentId);
    if (enrollmentId) setConfirmingCancelId("");
  }

  async function sendIntent(intent: PendingEnrollmentIntent) {
    if (previewMode || sendingRef.current || intent.organizationId !== organizationId ||
      pendingScopeLoadedFor !== organizationId || pendingStorageError !== "" ||
      (pendingIntentRef.current !== null && pendingIntentRef.current !== intent)) return;
    const wasPreviouslyUncertain =
      pendingIntentRef.current === intent && uncertainIntentRef.current;
    if (!persistPendingEnrollmentIntent(intent)) {
      setPendingStorageError("No se pudo guardar la operación en el almacenamiento de sesión. No se ha enviado ni se sobrescribirá ninguna operación; vuelve a comprobar el almacenamiento antes de continuar.");
      setPendingStorageFailureKind("write");
      return;
    }
    sendingRef.current = true;
    if (pendingIntentRef.current === null) uncertainIntentRef.current = false;
    pendingIntentRef.current = intent;
    setPendingIntent(intent);
    if (intent.kind === "create") setBusyCreate(true);
    else setBusyId(intent.enrollmentId ?? "");
    setError(""); setNotice("");
    let operationConfirmed = false;
    let preserveStorageFailure = false;
    const isCurrentIntent = () =>
      currentOrganizationIdRef.current === intent.organizationId &&
      pendingIntentRef.current === intent;
    try {
      const response = await fetch(intent.endpoint, {
        method: intent.method,
        headers: { "content-type": "application/json", "idempotency-key": intent.key },
        body: intent.body,
      });
      const payload = await response.json().catch(() => null);
      const outcome = enrollmentCommandOutcome(response, payload, intent.enrollmentId, {
        previouslyUncertain: wasPreviouslyUncertain,
        expectedCreateBody: intent.kind === "create" ? intent.body : undefined,
        expectedIdempotencyKey: intent.kind === "create" ? intent.key : undefined,
      });
      if (outcome.status === "uncertain") {
        if (isCurrentIntent()) {
          uncertainIntentRef.current = true;
          setError(outcome.message);
        }
        return;
      }
      if (!clearPendingEnrollmentIntent(intent)) {
        if (isCurrentIntent()) {
          preserveStorageFailure = true;
          setPendingStorageError("La respuesta llegó, pero no se pudo quitar la operación guardada. Mantendremos el bloqueo y el mismo reintento hasta poder limpiar el almacenamiento.");
          setPendingStorageFailureKind("write");
          setError(outcome.message);
        }
        return;
      }
      const currentIntent = isCurrentIntent();
      if (currentIntent) {
        pendingIntentRef.current = null;
        uncertainIntentRef.current = false;
        setPendingIntent(null);
        setPendingStorageError("");
        setPendingStorageFailureKind(null);
      }
      if (outcome.status === "rejected") {
        if (currentIntent) setError(outcome.message);
        return;
      }
      operationConfirmed = true;
      if (currentIntent) {
        setConfirmingCancelId(""); setConfirmingCompleteId("");
        if (intent.kind === "create") {
          setSelectedCandidate(null); setCandidateQuery(""); setCandidates([]);
          setClassTemplateId(""); setPricePlanId(null);
          setNotice("Inscripción registrada. Consulta su estado actualizado en el listado. Este envío no genera ningún cobro.");
        } else setNotice("Operación confirmada. Consulta el estado actualizado en el listado.");
        router.refresh();
      }
    } catch {
      if (currentOrganizationIdRef.current === intent.organizationId) {
        if (!operationConfirmed && isCurrentIntent()) uncertainIntentRef.current = true;
        setError(operationConfirmed ? "La operación se confirmó, pero no se pudo actualizar el listado. Recarga la página para consultar su estado." : "No sabemos si se guardó. Reintenta la misma operación sin recargar esta página; conservaremos sus datos y su clave para evitar duplicados.");
      }
    } finally {
      sendingRef.current = false; setBusyCreate(false); setBusyId("");
      // Re-read whichever academy is visible now, including A -> B -> A while
      // the request was pending and temporarily left the scope gate closed.
      // A same-scope cleanup failure must remain visible until explicit recovery.
      if (!preserveStorageFailure) {
        setPendingIntentReadAttempt(attempt => attempt + 1);
      }
    }
  }

  function recoverPendingStorage() {
    if (pendingStorageFailureKind === "write" && pendingIntentRef.current?.organizationId === organizationId) {
      if (persistPendingEnrollmentIntent(pendingIntentRef.current)) {
        setPendingStorageError("");
        setPendingStorageFailureKind(null);
      }
      return;
    }
    setPendingIntentReadAttempt(attempt => attempt + 1);
  }

  async function createEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (previewMode || writesBlocked || pendingIntentRef.current || sendingRef.current) return;
    setError("");
    setNotice("");
    if (pricePlansLoading || pricePlansError) {
      setError("Antes de registrar la inscripción, espera a que termine la consulta de tarifas o vuelve a consultarlas. No se ha enviado ninguna solicitud.");
      return;
    }
    if (pricePlanUnavailable) {
      event.currentTarget.querySelector<HTMLSelectElement>("#enrollment-price-plan")?.focus();
      return;
    }
    if (!selectedCandidate || !selectedClass || !startsOn) {
      setError("Elige una persona, una clase con plazas y una fecha.");
      return;
    }
    if (!isEnrollmentStartDateAllowed(startsOn, selectedClass)) {
      setError("La fecha de inicio debe quedar dentro del periodo de la clase.");
      document.getElementById("enrollment-starts-on")?.focus();
      return;
    }
    if (selectedClass.availableSeats < 1) {
      setError("La clase ya no tiene plazas disponibles.");
      return;
    }

    const body = {
      organizationId,
      locationId: createLocationId,
      athleteId: selectedCandidate.id,
      classTemplateId,
      startsOn,
      pricePlanId: pricePlanId || null,
    };
    try {
      await sendIntent({
        organizationId, kind: "create", key: "owner-enrollment:" + crypto.randomUUID(),
        endpoint: "/api/v1/owner/enrollments", method: "POST", body: JSON.stringify(body),
        description: `Alta de ${selectedCandidate.name} · ${selectedClass.name} · ${startsOn}`,
      });
    } catch {
      setError("No se ha podido preparar la inscripción. No se ha enviado ninguna solicitud.");
    }
  }

  async function changeStatus(
    enrollment: EnrollmentBundle["enrollments"][number],
    toStatus: ChangeableStatus
  ) {
    if (previewMode || writesBlocked || pendingIntentRef.current || sendingRef.current) return;
    const effectiveOn = bundle.localTodayByLocation[enrollment.locationId];
    if (!effectiveOn) {
      setError("No se pudo determinar la fecha local de la sede.");
      return;
    }
    try {
      await sendIntent({ organizationId, kind: "transition", enrollmentId: enrollment.id,
        key: "owner-enrollment-status:" + crypto.randomUUID(),
        endpoint: "/api/v1/owner/enrollments/" + enrollment.id, method: "PATCH",
        body: JSON.stringify({ organizationId, expectedVersion: enrollment.version, toStatus, effectiveOn }),
        description: `Cambio de ${enrollment.athleteName} · ${enrollment.className} · ${effectiveOn}`,
      });
    } catch {
      setError("No se ha podido preparar el cambio. No se ha enviado ninguna solicitud.");
    }
  }

  function applyFilters(nextStatus: StatusFilter, nextLocationId: string) {
    if (pendingIntentRef.current || sendingRef.current) return;
    router.push(
      statusHref(
        bundle,
        nextStatus,
        1,
        nextLocationId === "all" ? "" : nextLocationId
      )
    );
  }

  const pendingTotal = bundle.totalsByStatus.pending ?? 0;
  const activeTotal = bundle.totalsByStatus.active ?? 0;
  const pausedTotal = bundle.totalsByStatus.paused ?? 0;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {previewMode ? (
          <p className="text-sm font-semibold text-teal-900">
            Vista de ejemplo · solo lectura
          </p>
        ) : (
          <Link
            href={"/owner?organizationId=" + organizationId}
            className="touch-target inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-900 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver al resumen
          </Link>
        )}

        <header className="mt-6 flex flex-col gap-4 border-b border-slate-300 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-900">
              Operaciones de la academia
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Inscripciones
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              Asigna una gimnasta o participante a una clase y controla su
              estado desde un solo lugar.
            </p>
          </div>
          {!previewMode && (
            <button
              type="button"
              disabled={commandsLocked || (writesBlocked && !createOpen)}
              onClick={toggleCreateForm}
              className={primaryButtonClassName}
              aria-expanded={createOpen}
              aria-controls={createOpen ? "new-enrollment-form" : undefined}
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {createOpen ? "Cerrar formulario" : "Nueva inscripción"}
            </button>
          )}
        </header>

        {previewMode && (
          <p className="mt-5 border-l-4 border-amber-600 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            Datos ficticios para revisar la pantalla. No se consulta ni modifica
            ninguna academia.
          </p>
        )}

        {!previewMode ? (
          <OwnerOperationalReadOnlyNotice organizationId={organizationId} />
        ) : null}

        <p className="mt-5 border-l-4 border-teal-700 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-950">
          El alta queda pendiente y reserva una plaza. No crea una cuota ni
          inicia cobros; los pagos se gestionan aparte.
        </p>

        {pendingStorageError ? (
          <section className="mt-5 border border-rose-700 bg-rose-50 p-4 text-sm text-rose-950" aria-label="Almacenamiento de operación pendiente">
            <p role="alert">{pendingStorageError}</p>
            {pendingStorageFailureKind && (
              <button type="button" className={primaryButtonClassName + " mt-3"} onClick={recoverPendingStorage}>
                Volver a comprobar almacenamiento
              </button>
            )}
          </section>
        ) : null}

        {pendingIntent ? (
          <section className="mt-5 border border-amber-600 bg-amber-50 p-4" aria-label="Operación de inscripción pendiente" aria-busy={busyCreate || busyId !== ""}>
            <p role="status">{pendingIntent.organizationId === organizationId ? <>{pendingIntent.description}. {busyCreate || busyId ? "Enviando la solicitud…" : "Resultado sin confirmar. La solicitud original está guardada en esta sesión; al volver solo podrás reintentar exactamente el mismo cuerpo y clave."}</> : "Hay una operación de inscripción pendiente en otra academia."}</p>
            {pendingIntent.organizationId === organizationId ? <button ref={retryButtonRef} type="button" className={primaryButtonClassName + " mt-3"} disabled={busyCreate || busyId !== ""} onClick={() => void sendIntent(pendingIntent)}>Reintentar la misma operación</button> : <p>Vuelve a la academia de esa operación antes de iniciar otra.</p>}
          </section>
        ) : null}

        <fieldset disabled={commandsLocked} className="min-w-0 border-0 p-0 m-0">
          <legend className="sr-only">Gestionar inscripciones</legend>
        {createOpen && (
          <OwnerEnrollmentCreateForm
            organizationId={organizationId}
            locations={bundle.locations}
            classes={bundle.classes}
            createLocationId={createLocationId}
            classTemplateId={classTemplateId}
            classesForLocation={classesForLocation}
            selectedClass={selectedClass}
            participantLabel={participantLabel}
            candidates={candidates}
            selectedCandidate={selectedCandidate}
            candidateQuery={candidateQuery}
            candidateLoading={candidateLoading}
            candidateError={candidateError}
            candidateNotice={candidateNotice}
            startsOn={startsOn}
            pricePlans={pricePlans}
            pricePlansLoading={pricePlansLoading}
            pricePlansError={pricePlansError}
            pricePlanUnavailable={pricePlanUnavailable}
            pricePlanId={pricePlanId ?? ""}
            createToday={createToday}
            busyCreate={busyCreate}
            writesBlocked={writesBlocked}
            previewMode={previewMode}
            onLocationChange={changeCreateLocation}
            onClassChange={changeClassTemplate}
            onCandidateQueryChange={changeCandidateQuery}
            onCandidateSelect={(candidate) => {
              setSelectedCandidate(candidate);
              setCandidates([]);
            }}
            onCandidateClear={() => {
              setSelectedCandidate(null);
              setCandidateQuery("");
            }}
            onStartsOnChange={setStartsOn}
            onPricePlanChange={setPricePlanId}
            onRetryCandidates={() => setCandidateRetry(value => value + 1)}
            onRetryPricePlans={() => setPricePlansRetry(value => value + 1)}
            onSubmit={createEnrollment}
          />
        )}

        <OwnerEnrollmentList
          bundle={bundle}
          selectedStatus={selectedStatus}
          previewMode={previewMode}
          writesBlocked={writesBlocked}
          navigationLocked={commandsLocked}
          createOpen={createOpen}
          busyId={busyId}
          confirmingCancelId={confirmingCancelId}
          confirmingCompleteId={confirmingCompleteId}
          error={error}
          notice={notice}
          onApplyFilters={applyFilters}
          onOpenCreate={() => setCreateOpen(true)}
          onConfirmCancel={confirmCancel}
          onConfirmComplete={confirmComplete}
          onChangeStatus={(enrollment, status) =>
            void changeStatus(enrollment, status)
          }
        />
        </fieldset>

        <section
          aria-label="Resumen de inscripciones"
          className="mt-6 grid gap-3 sm:grid-cols-3"
        >
          {[
            { label: "Activas", total: activeTotal, tone: "text-emerald-800" },
            {
              label: "Pendientes",
              total: pendingTotal,
              tone: "text-amber-900",
            },
            { label: "En pausa", total: pausedTotal, tone: "text-orange-900" },
          ].map((item) => (
            <div
              key={item.label}
              className="border border-slate-300 bg-white p-4"
            >
              <p className="text-sm font-semibold text-slate-700">
                {item.label}
              </p>
              <p className={"mt-2 text-3xl font-bold " + item.tone}>
                {item.total}
              </p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
