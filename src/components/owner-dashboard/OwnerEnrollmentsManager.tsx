"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Search, UserPlus } from "lucide-react";

type EnrollmentBundle = Awaited<
  ReturnType<
    typeof import("@/modules/enrollments/application/enrollment-query-service").getOwnerEnrollmentsPageData
  >
> & { filterLocationId: string | null };
type Candidate = { id: string; name: string };
type StatusFilter =
  "all" | "pending" | "trial" | "active" | "paused" | "cancelled" | "completed";
type ChangeableStatus = "active" | "paused" | "cancelled" | "completed";

const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100";
const primaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center gap-2 bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center gap-2 border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

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

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    trial: "Prueba",
    active: "Activa",
    paused: "En pausa",
    cancelled: "Baja",
    completed: "Finalizada",
  };
  return labels[status] ?? "Estado desconocido";
}

function statusTone(status: string): string {
  if (status === "active")
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (status === "pending")
    return "border-amber-300 bg-amber-50 text-amber-950";
  if (status === "paused")
    return "border-orange-300 bg-orange-50 text-orange-950";
  return "border-slate-300 bg-slate-100 text-slate-800";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value + "T12:00:00Z"));
}

function statusHref(
  bundle: EnrollmentBundle,
  status: StatusFilter,
  page = 1,
  locationId = bundle.filterLocationId ?? ""
): string {
  const params = new URLSearchParams({
    organizationId: bundle.organization.id,
  });
  if (locationId) params.set("locationId", locationId);
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  return "/owner/enrollments?" + params.toString();
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

        {createOpen && (
          <section
            aria-labelledby="new-enrollment-heading"
            className="mt-6 border border-slate-300 bg-white p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="new-enrollment-heading"
                  className="text-xl font-bold tracking-tight"
                >
                  Añadir a una clase
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-700">
                  El registro queda pendiente y reserva una plaza hasta que lo
                  actives o lo canceles.
                </p>
              </div>
            </div>

            {bundle.classes.length === 0 ? (
              <div className="mt-5 border border-dashed border-slate-400 bg-slate-50 p-4">
                <p className="text-sm leading-6 text-slate-800">
                  Primero crea una clase recurrente para poder asignar plazas.
                </p>
                <Link
                  href={"/owner/classes?organizationId=" + organizationId}
                  className="mt-3 inline-flex min-h-11 items-center font-semibold text-teal-900 underline underline-offset-4"
                >
                  Crear una clase
                </Link>
              </div>
            ) : (
              <form
                aria-label="Crear inscripción"
                className="mt-5 grid gap-4 md:grid-cols-2"
                onSubmit={createEnrollment}
              >
                <div>
                  <label
                    htmlFor="enrollment-location"
                    className="mb-1 block text-sm font-semibold"
                  >
                    Sede
                  </label>
                  <select
                    id="enrollment-location"
                    className={fieldClassName}
                    value={createLocationId}
                    onChange={(event) =>
                      changeCreateLocation(event.currentTarget.value)
                    }
                    disabled={busyCreate || previewMode}
                  >
                    {bundle.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="enrollment-class"
                    className="mb-1 block text-sm font-semibold"
                  >
                    Clase
                  </label>
                  <select
                    id="enrollment-class"
                    className={fieldClassName}
                    value={classTemplateId}
                    onChange={(event) => {
                      setClassTemplateId(event.currentTarget.value);
                      setSelectedCandidate(null);
                      setCandidateQuery("");
                      setCandidates([]);
                      setCandidateLoading(false);
                      setCandidateError("");
                      setCandidateNotice("");
                    }}
                    disabled={
                      busyCreate ||
                      previewMode ||
                      classesForLocation.length === 0
                    }
                    required
                  >
                    <option value="">Selecciona una clase</option>
                    {classesForLocation.map((classItem) => (
                      <option
                        key={classItem.id}
                        value={classItem.id}
                        disabled={classItem.availableSeats < 1}
                      >
                        {classItem.name}
                        {classItem.programName
                          ? " · " + classItem.programName
                          : ""}
                        {" · "}
                        {classItem.availableSeats > 0
                          ? classItem.availableSeats + " plazas libres"
                          : "Completa"}
                      </option>
                    ))}
                  </select>
                  {classesForLocation.length === 0 && (
                    <p className="mt-1 text-sm text-slate-700">
                      No hay clases activas en esta sede.
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="enrollment-athlete-search"
                    className="mb-1 block text-sm font-semibold"
                  >
                    {participantLabel}
                  </label>
                  {selectedCandidate ? (
                    <div className="flex min-h-11 items-center justify-between gap-3 border border-teal-700 bg-teal-50 px-3 py-2">
                      <span className="font-semibold text-teal-950">
                        {selectedCandidate.name}
                      </span>
                      <button
                        type="button"
                        className="touch-target min-h-11 px-2 text-sm font-semibold text-teal-900 underline underline-offset-4"
                        disabled={previewMode}
                        onClick={() => {
                          setSelectedCandidate(null);
                          setCandidateQuery("");
                        }}
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500"
                        aria-hidden="true"
                      />
                      <input
                        id="enrollment-athlete-search"
                        className={fieldClassName + " pl-10"}
                        type="search"
                        autoComplete="off"
                        minLength={2}
                        maxLength={80}
                        value={candidateQuery}
                        onChange={(event) =>
                          changeCandidateQuery(event.currentTarget.value)
                        }
                        placeholder="Escribe al menos dos letras"
                        disabled={busyCreate || !classTemplateId}
                        aria-describedby="enrollment-search-help"
                      />
                    </div>
                  )}
                  <p
                    id="enrollment-search-help"
                    className="mt-1 text-xs leading-5 text-slate-600"
                  >
                    Solo aparecen personas vinculadas a esta sede.
                  </p>
                  {candidateLoading && (
                    <p role="status" className="mt-2 text-sm text-slate-700">
                      Buscando…
                    </p>
                  )}
                  {candidateError && (
                    <p role="alert" className="mt-2 text-sm text-red-800">
                      {candidateError}
                    </p>
                  )}
                  {candidateNotice && (
                    <p className="mt-2 text-sm text-slate-700">
                      {candidateNotice}{" "}
                      <Link
                        href={
                          "/owner/groups?organizationId=" +
                          organizationId +
                          "&locationId=" +
                          createLocationId
                        }
                        className="font-semibold text-teal-900 underline underline-offset-4"
                      >
                        Ir a Grupos
                      </Link>
                    </p>
                  )}
                  {candidates.length > 0 && !selectedCandidate && (
                    <ul
                      aria-label="Resultados de búsqueda"
                      className="mt-2 divide-y divide-slate-200 border border-slate-300 bg-white"
                    >
                      {candidates.map((candidate) => (
                        <li key={candidate.id}>
                          <button
                            type="button"
                            className="touch-target min-h-11 w-full px-3 py-2 text-left text-sm font-medium hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-teal-800"
                            onClick={() => {
                              setSelectedCandidate(candidate);
                              setCandidates([]);
                            }}
                          >
                            {candidate.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="enrollment-starts-on"
                    className="mb-1 block text-sm font-semibold"
                  >
                    Fecha de inicio
                  </label>
                  <input
                    id="enrollment-starts-on"
                    className={fieldClassName}
                    type="date"
                    value={startsOn}
                    onChange={(event) => setStartsOn(event.currentTarget.value)}
                    disabled={busyCreate || previewMode}
                    required
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className={primaryButtonClassName + " w-full"}
                    disabled={
                      previewMode ||
                      busyCreate ||
                      !selectedCandidate ||
                      !selectedClass ||
                      selectedClass.availableSeats < 1 ||
                      !startsOn
                    }
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {busyCreate
                      ? "Guardando…"
                      : previewMode
                        ? "Solo vista de ejemplo"
                        : "Registrar inscripción pendiente"}
                  </button>
                </div>
                <p className="text-xs leading-5 text-slate-600 md:col-span-2">
                  Fecha local de la sede: {createToday || "no disponible"}. La
                  inscripción no activa cuotas ni cobros.
                </p>
              </form>
            )}
          </section>
        )}

        <section aria-labelledby="enrollment-list-heading" className="mt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="enrollment-list-heading"
                className="text-xl font-bold tracking-tight"
              >
                Inscripciones de la academia
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                {bundle.total} resultado{bundle.total === 1 ? "" : "s"}
                {bundle.pages > 1
                  ? " · página " + bundle.page + " de " + bundle.pages
                  : ""}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {bundle.locations.length > 1 && (
                <div>
                  <label
                    htmlFor="enrollment-filter-location"
                    className="sr-only"
                  >
                    Filtrar por sede
                  </label>
                  <select
                    id="enrollment-filter-location"
                    className={fieldClassName}
                    value={bundle.filterLocationId ?? "all"}
                    disabled={previewMode}
                    onChange={(event) =>
                      applyFilters(selectedStatus, event.currentTarget.value)
                    }
                  >
                    <option value="all">Todas mis sedes</option>
                    {bundle.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="enrollment-filter-status" className="sr-only">
                  Filtrar por estado
                </label>
                <select
                  id="enrollment-filter-status"
                  className={fieldClassName}
                  value={selectedStatus}
                  disabled={previewMode}
                  onChange={(event) =>
                    applyFilters(
                      event.currentTarget.value as StatusFilter,
                      bundle.filterLocationId ?? "all"
                    )
                  }
                >
                  <option value="all">Todos los estados</option>
                  <option value="pending">Pendientes</option>
                  <option value="active">Activas</option>
                  <option value="paused">En pausa</option>
                  <option value="trial">Pruebas</option>
                  <option value="cancelled">Bajas</option>
                  <option value="completed">Finalizadas</option>
                </select>
              </div>
            </div>
          </div>

          {(error || notice) && (
            <div
              className={
                "mt-4 border px-4 py-3 text-sm leading-6 " +
                (error
                  ? "border-red-300 bg-red-50 text-red-900"
                  : "border-emerald-300 bg-emerald-50 text-emerald-950")
              }
            >
              <p role={error ? "alert" : "status"}>{error || notice}</p>
            </div>
          )}

          {bundle.enrollments.length === 0 ? (
            <div className="mt-4 border border-dashed border-slate-400 bg-white px-5 py-8 text-center">
              <h3 className="font-semibold">
                No hay inscripciones en este filtro
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Prueba otro estado o registra una plaza nueva.
              </p>
              {!createOpen && (
                <button
                  type="button"
                  className={secondaryButtonClassName + " mt-4"}
                  onClick={() => setCreateOpen(true)}
                >
                  Nueva inscripción
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-4 grid gap-3">
              {bundle.enrollments.map((enrollment) => {
                const localToday =
                  bundle.localTodayByLocation[enrollment.locationId];
                const canActivate =
                  (enrollment.status === "pending" &&
                    !!localToday &&
                    enrollment.startsOn <= localToday) ||
                  enrollment.status === "paused";
                const canPause = enrollment.status === "active";
                const canComplete =
                  enrollment.status === "active" ||
                  enrollment.status === "paused";
                const canCancel =
                  enrollment.status === "pending" ||
                  enrollment.status === "active" ||
                  enrollment.status === "paused";
                const pendingStartsInFuture =
                  enrollment.status === "pending" &&
                  !!localToday &&
                  enrollment.startsOn > localToday;
                const confirmingCancel = confirmingCancelId === enrollment.id;
                const confirmingComplete =
                  confirmingCompleteId === enrollment.id;
                return (
                  <li
                    key={enrollment.id}
                    className="border border-slate-300 bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold">
                            {enrollment.athleteName}
                          </h3>
                          <span
                            className={
                              "inline-flex min-h-7 items-center border px-2.5 text-xs font-bold " +
                              statusTone(enrollment.status)
                            }
                          >
                            {statusLabel(enrollment.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {enrollment.className}
                          {enrollment.programName
                            ? " · " + enrollment.programName
                            : ""}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {enrollment.locationName}
                          {" · Inicio "}
                          {formatDate(enrollment.startsOn)}
                          {enrollment.endsOn
                            ? " · Fin " + formatDate(enrollment.endsOn)
                            : ""}
                        </p>
                        {pendingStartsInFuture && (
                          <p className="mt-2 text-sm text-amber-900">
                            Empieza el {formatDate(enrollment.startsOn)}. Podrás
                            activarla ese día.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {!previewMode && canActivate && (
                          <button
                            type="button"
                            className={secondaryButtonClassName}
                            disabled={busyId === enrollment.id}
                            onClick={() =>
                              void changeStatus(enrollment, "active")
                            }
                          >
                            {enrollment.status === "paused"
                              ? "Reanudar"
                              : "Activar"}
                          </button>
                        )}
                        {!previewMode && canPause && (
                          <button
                            type="button"
                            className={secondaryButtonClassName}
                            disabled={busyId === enrollment.id}
                            onClick={() =>
                              void changeStatus(enrollment, "paused")
                            }
                          >
                            Pausar
                          </button>
                        )}
                        {!previewMode && canComplete && !confirmingComplete && (
                          <button
                            type="button"
                            className={secondaryButtonClassName}
                            disabled={busyId === enrollment.id}
                            onClick={() => {
                              setConfirmingCancelId("");
                              setConfirmingCompleteId(enrollment.id);
                            }}
                          >
                            Finalizar
                          </button>
                        )}
                        {!previewMode && canCancel && !confirmingCancel && (
                          <button
                            type="button"
                            className="touch-target inline-flex min-h-11 items-center border border-slate-400 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800"
                            disabled={busyId === enrollment.id}
                            onClick={() => {
                              setConfirmingCompleteId("");
                              setConfirmingCancelId(enrollment.id);
                            }}
                          >
                            Dar de baja
                          </button>
                        )}
                        {!previewMode && confirmingCancel && (
                          <div
                            role="group"
                            aria-label="Confirmar baja"
                            className="flex flex-wrap items-center gap-2 border border-red-300 bg-red-50 p-2"
                          >
                            <span className="px-1 text-sm font-medium text-red-950">
                              ¿Dar de baja?
                            </span>
                            <button
                              type="button"
                              className="touch-target min-h-11 bg-red-800 px-3 text-sm font-bold text-white hover:bg-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
                              disabled={busyId === enrollment.id}
                              onClick={() =>
                                void changeStatus(enrollment, "cancelled")
                              }
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              className="touch-target min-h-11 px-3 text-sm font-semibold text-red-950 underline underline-offset-4"
                              onClick={() => setConfirmingCancelId("")}
                            >
                              Volver
                            </button>
                          </div>
                        )}
                        {!previewMode && confirmingComplete && (
                          <div
                            role="group"
                            aria-label="Confirmar finalización"
                            className="flex flex-wrap items-center gap-2 border border-slate-400 bg-slate-50 p-2"
                          >
                            <span className="px-1 text-sm font-medium text-slate-950">
                              ¿Finalizar inscripción?
                            </span>
                            <button
                              type="button"
                              className={primaryButtonClassName}
                              disabled={busyId === enrollment.id}
                              onClick={() =>
                                void changeStatus(enrollment, "completed")
                              }
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              className="touch-target min-h-11 px-3 text-sm font-semibold text-slate-900 underline underline-offset-4"
                              onClick={() => setConfirmingCompleteId("")}
                            >
                              Volver
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {previewMode && (
                      <p className="mt-3 text-xs leading-5 text-slate-600">
                        Acciones desactivadas en la vista de ejemplo.
                      </p>
                    )}
                    {enrollment.status === "trial" && (
                      <p className="mt-3 text-xs leading-5 text-slate-600">
                        Las pruebas se completan desde su flujo específico; esta
                        pantalla no modifica el seguimiento de la prueba.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {bundle.pages > 1 && (
            <nav
              aria-label="Páginas de inscripciones"
              className="mt-5 flex items-center justify-between"
            >
              {bundle.page > 1 ? (
                <Link
                  href={statusHref(bundle, selectedStatus, bundle.page - 1)}
                  className={secondaryButtonClassName}
                >
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-slate-700">
                {bundle.page} / {bundle.pages}
              </span>
              {bundle.page < bundle.pages ? (
                <Link
                  href={statusHref(bundle, selectedStatus, bundle.page + 1)}
                  className={secondaryButtonClassName}
                >
                  Siguiente
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
