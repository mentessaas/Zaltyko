"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, UserPlus } from "lucide-react";

import { OwnerEnrollmentCreateForm } from "./OwnerEnrollmentCreateForm";
import { OwnerEnrollmentList } from "./OwnerEnrollmentList";
import { primaryButtonClassName, statusHref } from "./owner-enrollment-ui";
import type {
  Candidate,
  ChangeableStatus,
  EnrollmentBundle,
  StatusFilter,
} from "./owner-enrollment-types";

function responseData<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return null;
}

function responseError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "No se pudo guardar. Inténtalo de nuevo.";
  }
  const detail = "detail" in payload ? payload.detail : undefined;
  const message = "message" in payload ? payload.message : undefined;
  return typeof detail === "string"
    ? detail
    : typeof message === "string"
      ? message
      : "No se pudo guardar. Inténtalo de nuevo.";
}

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
  const [createOpen, setCreateOpen] = useState(
    previewCreateForm || (!previewMode && bundle.enrollments.length === 0)
  );
  const [createLocationId, setCreateLocationId] = useState(
    bundle.selectedLocationId ?? bundle.locations[0]?.id ?? ""
  );
  const [classTemplateId, setClassTemplateId] = useState(
    previewCreateForm ? (bundle.classes[0]?.id ?? "") : ""
  );
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(
    previewCreateForm
      ? {
          id: "20000000-0000-0000-0000-000000000071",
          name: "Gimnasta Ejemplo A",
        }
      : null
  );
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [candidateNotice, setCandidateNotice] = useState("");
  const [startsOn, setStartsOn] = useState(
    bundle.localTodayByLocation[createLocationId] ?? ""
  );
  const [busyId, setBusyId] = useState("");
  const [busyCreate, setBusyCreate] = useState(false);
  const [confirmingCancelId, setConfirmingCancelId] = useState("");
  const [confirmingCompleteId, setConfirmingCompleteId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retryCreate = useRef<{
    key: string;
    body: Record<string, string>;
  } | null>(null);
  const retryTransitions = useRef(new Map<string, string>());
  const organizationId = bundle.organization.id;
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

  useEffect(() => {
    if (
      previewMode ||
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
        const data = responseData<{ items: Candidate[] }>(payload);
        if (!response.ok || !data) {
          setCandidates([]);
          setCandidateError(responseError(payload));
          return;
        }
        setCandidates(data.items);
        if (data.items.length === 0) {
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
    candidateQuery,
    classTemplateId,
    createLocationId,
    organizationId,
    previewMode,
    selectedCandidate,
  ]);

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
  }

  function confirmCancel(enrollmentId: string) {
    setConfirmingCancelId(enrollmentId);
    if (enrollmentId) setConfirmingCompleteId("");
  }

  function confirmComplete(enrollmentId: string) {
    setConfirmingCompleteId(enrollmentId);
    if (enrollmentId) setConfirmingCancelId("");
  }

  async function createEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (previewMode) return;
    setError("");
    setNotice("");
    if (!selectedCandidate || !selectedClass || !startsOn) {
      setError("Elige una persona, una clase con plazas y una fecha.");
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
    };
    const retry = retryCreate.current;
    const key =
      retry && JSON.stringify(retry.body) === JSON.stringify(body)
        ? retry.key
        : "owner-enrollment:" + crypto.randomUUID();
    retryCreate.current = { key, body };
    setBusyCreate(true);
    try {
      const response = await fetch("/api/v1/owner/enrollments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      const created = responseData<{ id: string }>(payload);
      if (!response.ok || !created?.id) {
        if (response.status < 500) retryCreate.current = null;
        setError(responseError(payload));
        return;
      }
      retryCreate.current = null;
      setSelectedCandidate(null);
      setCandidateQuery("");
      setCandidates([]);
      setClassTemplateId("");
      setNotice(
        "Inscripción pendiente registrada. No se ha generado ningún cobro."
      );
      router.refresh();
    } catch {
      setError(
        "No sabemos si se guardó. Repite el mismo envío; la clave segura evita duplicarlo."
      );
    } finally {
      setBusyCreate(false);
    }
  }

  async function changeStatus(
    enrollment: EnrollmentBundle["enrollments"][number],
    toStatus: ChangeableStatus
  ) {
    const effectiveOn = bundle.localTodayByLocation[enrollment.locationId];
    if (!effectiveOn) {
      setError("No se pudo determinar la fecha local de la sede.");
      return;
    }
    const command = enrollment.id + ":" + toStatus;
    const key =
      retryTransitions.current.get(command) ??
      "owner-enrollment-status:" + crypto.randomUUID();
    retryTransitions.current.set(command, key);
    setBusyId(enrollment.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/v1/owner/enrollments/" + enrollment.id,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
          },
          body: JSON.stringify({
            organizationId,
            expectedVersion: enrollment.version,
            toStatus,
            effectiveOn,
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      const updated = responseData<{ id: string }>(payload);
      if (!response.ok || !updated?.id) {
        if (response.status < 500) retryTransitions.current.delete(command);
        setError(responseError(payload));
        return;
      }
      retryTransitions.current.delete(command);
      setConfirmingCancelId("");
      setConfirmingCompleteId("");
      setNotice("Inscripción actualizada.");
      router.refresh();
    } catch {
      setError(
        "No sabemos si se guardó el cambio. Repite la acción para comprobarlo sin duplicarlo."
      );
    } finally {
      setBusyId("");
    }
  }

  function applyFilters(nextStatus: StatusFilter, nextLocationId: string) {
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
              onClick={() => setCreateOpen((open) => !open)}
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

        <p className="mt-5 border-l-4 border-teal-700 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-950">
          El alta queda pendiente y reserva una plaza. No crea una cuota ni
          inicia cobros; los pagos se gestionan aparte.
        </p>

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
            createToday={createToday}
            busyCreate={busyCreate}
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
            onSubmit={createEnrollment}
          />
        )}

        <section
          aria-label="Resumen de inscripciones"
          className="mt-6 grid gap-3 sm:grid-cols-3"
        >
          {[
            { label: "Activas", total: activeTotal, tone: "text-emerald-800" },
            { label: "Pendientes", total: pendingTotal, tone: "text-amber-900" },
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

        <OwnerEnrollmentList
          bundle={bundle}
          selectedStatus={selectedStatus}
          previewMode={previewMode}
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
      </div>
    </main>
  );
}
