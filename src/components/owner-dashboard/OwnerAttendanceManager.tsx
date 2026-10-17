"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const attendanceStatuses = [
  { value: "present", label: "Presente" },
  { value: "absent", label: "Ausente" },
  { value: "excused", label: "Justificada" },
  { value: "late", label: "Llegó tarde" },
] as const;

type AttendanceStatus = (typeof attendanceStatuses)[number]["value"];
type AttendanceItem = {
  enrollmentId: string;
  athleteName: string;
  attendanceStatus: AttendanceStatus | null;
};
type SessionOption = {
  id: string;
  className: string;
  startsAt: string;
  timezone: string;
};
type AttendanceCommand = {
  organizationId: string;
  locationId: string;
  enrollmentId: string;
  status: AttendanceStatus;
};
type RetryRequest = { key: string; body: AttendanceCommand };

const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:bg-slate-100";
const buttonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-teal-800 bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

function responseData<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return null;
}

function responseError(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const detail = "detail" in payload ? payload.detail : undefined;
    const message = "message" in payload ? payload.message : undefined;
    if (typeof detail === "string") return detail;
    if (typeof message === "string") return message;
  }
  return "No se ha podido guardar la asistencia. Inténtalo de nuevo.";
}

function formatSessionDate(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

export function OwnerAttendanceManager({
  organizationId,
  locationId,
  sessions,
  initialSessionId,
}: {
  organizationId: string;
  locationId: string;
  sessions: SessionOption[];
  initialSessionId?: string | null;
}) {
  const [sessionId, setSessionId] = useState(
    initialSessionId &&
      sessions.some((session) => session.id === initialSessionId)
      ? initialSessionId
      : (sessions[0]?.id ?? "")
  );
  const [attendees, setAttendees] = useState<AttendanceItem[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<
    Record<string, AttendanceStatus | "">
  >({});
  const [retryRequests, setRetryRequests] = useState<
    Record<string, RetryRequest>
  >({});
  const [savingEnrollmentId, setSavingEnrollmentId] = useState<string | null>(
    null
  );
  const hasPendingRetry = Object.keys(retryRequests).length > 0;
  const [loading, setLoading] = useState(sessions.length > 0);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (!sessionId) return;

    const params = new URLSearchParams({ organizationId, locationId });
    void fetch(
      `/api/v1/owner/sessions/${encodeURIComponent(sessionId)}/attendance?${params.toString()}`,
      { cache: "no-store" }
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        const data = responseData<{ items: AttendanceItem[] }>(payload);
        if (!response.ok || !data || !Array.isArray(data.items)) {
          throw new Error(responseError(payload));
        }
        if (requestSequence.current === requestId) {
          setAttendees(data.items);
          setSelectedStatuses(
            Object.fromEntries(
              data.items.map((item) => [
                item.enrollmentId,
                item.attendanceStatus ?? "",
              ])
            )
          );
        }
      })
      .catch((cause: unknown) => {
        if (requestSequence.current === requestId) {
          setLoadError(
            cause instanceof Error && cause.name !== "TypeError"
              ? cause.message
              : "No se ha podido cargar la lista. Comprueba la conexión e inténtalo de nuevo."
          );
        }
      })
      .finally(() => {
        if (requestSequence.current === requestId) setLoading(false);
      });

    return () => {
      requestSequence.current += 1;
    };
  }, [locationId, organizationId, refreshKey, sessionId]);

  async function saveAttendance(
    enrollmentId: string,
    command: AttendanceCommand,
    retry?: RetryRequest
  ) {
    const request = retry ?? {
      key: `owner-attendance:${crypto.randomUUID()}`,
      body: command,
    };
    setSavingEnrollmentId(enrollmentId);
    setSaveError("");
    setNotice("");
    setRetryRequests((current) => ({ ...current, [enrollmentId]: request }));
    try {
      const response = await fetch(
        `/api/v1/owner/sessions/${encodeURIComponent(sessionId)}/attendance`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": request.key,
          },
          body: JSON.stringify(request.body),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status < 500) {
          setRetryRequests((current) => {
            const next = { ...current };
            delete next[enrollmentId];
            return next;
          });
        }
        throw new Error(
          response.status >= 500
            ? "No sabemos si se guardó. Reintenta este mismo envío para evitar duplicados."
            : responseError(payload)
        );
      }

      setAttendees((current) =>
        current.map((item) =>
          item.enrollmentId === enrollmentId
            ? { ...item, attendanceStatus: request.body.status }
            : item
        )
      );
      setRetryRequests((current) => {
        const next = { ...current };
        delete next[enrollmentId];
        return next;
      });
      setNotice("Asistencia guardada.");
    } catch (cause) {
      setSaveError(
        cause instanceof Error && cause.name !== "TypeError"
          ? cause.message
          : "No sabemos si se guardó. Reintenta este mismo envío para evitar duplicados."
      );
    } finally {
      setSavingEnrollmentId(null);
    }
  }

  const selectedSession = sessions.find((session) => session.id === sessionId);

  return (
    <main className="min-h-screen bg-[#F1F3EF] px-5 py-6 text-slate-950 sm:py-10">
      <div className="mx-auto grid max-w-5xl gap-8">
        <div className="grid gap-5">
          <Link
            href={`/owner?organizationId=${encodeURIComponent(organizationId)}&locationId=${encodeURIComponent(locationId)}`}
            className="touch-target inline-flex min-h-11 w-fit items-center border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
          >
            Volver al panel
          </Link>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-900">
              Pase de lista
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Asistencia de la sesión
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Marca la asistencia de las gimnastas inscritas. Los cambios se
              guardan individualmente.
            </p>
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="border border-slate-300 bg-white p-5 text-sm leading-6 text-slate-700">
            Aún no hay sesiones para pasar lista. Crea una clase recurrente para
            preparar sus sesiones.
          </p>
        ) : (
          <section className="grid gap-5 border border-slate-200 bg-white p-5 sm:p-7">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-slate-900">Sesión</span>
              <select
                value={sessionId}
                onChange={(event) => {
                  const nextSessionId = event.target.value;
                  if (nextSessionId === sessionId) return;

                  setAttendees([]);
                  setSelectedStatuses({});
                  setLoadError("");
                  setSaveError("");
                  setNotice("");
                  setLoading(true);
                  setSessionId(nextSessionId);
                }}
                disabled={savingEnrollmentId !== null || hasPendingRetry}
                className={fieldClassName}
                aria-label="Seleccionar sesión"
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.className} ·{" "}
                    {formatSessionDate(session.startsAt, session.timezone)}
                  </option>
                ))}
              </select>
            </label>
            {selectedSession && (
              <p className="text-sm text-slate-600">
                {selectedSession.className} ·{" "}
                {formatSessionDate(
                  selectedSession.startsAt,
                  selectedSession.timezone
                )}
              </p>
            )}

            {loading && (
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-slate-600"
              >
                Cargando lista…
              </p>
            )}
            {loadError && (
              <div
                role="alert"
                className="border border-red-300 bg-red-50 p-4 text-sm text-red-900"
              >
                <p>{loadError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setAttendees([]);
                    setLoadError("");
                    setLoading(true);
                    setRefreshKey((current) => current + 1);
                  }}
                  className="mt-3 underline underline-offset-2"
                >
                  Volver a intentar
                </button>
              </div>
            )}
            {saveError && (
              <p
                role="alert"
                className="border border-red-300 bg-red-50 p-4 text-sm text-red-900"
              >
                {saveError}
              </p>
            )}
            {notice && (
              <p
                role="status"
                aria-live="polite"
                className="border border-teal-300 bg-teal-50 p-4 text-sm text-teal-950"
              >
                {notice}
              </p>
            )}

            {!loading && !loadError && attendees.length === 0 ? (
              <p className="border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                No hay gimnastas con inscripción vigente en esta sesión.
              </p>
            ) : !loadError ? (
              <ul className="divide-y divide-slate-200 border-y border-slate-200">
                {attendees.map((attendee) => {
                  const retry = retryRequests[attendee.enrollmentId];
                  const status = selectedStatuses[attendee.enrollmentId] ?? "";
                  const rowBusy = savingEnrollmentId === attendee.enrollmentId;
                  const saveAction = rowBusy
                    ? "Guardando asistencia"
                    : retry
                      ? "Reintentar guardado"
                      : "Guardar asistencia";
                  return (
                    <li
                      key={attendee.enrollmentId}
                      className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-center"
                    >
                      <span className="font-semibold text-slate-950">
                        {attendee.athleteName}
                      </span>
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold text-slate-600">
                          Estado
                        </span>
                        <select
                          value={status}
                          disabled={
                            Boolean(retry) ||
                            savingEnrollmentId !== null ||
                            loading
                          }
                          onChange={(event) => {
                            setSelectedStatuses((current) => ({
                              ...current,
                              [attendee.enrollmentId]: event.target.value as
                                AttendanceStatus | "",
                            }));
                          }}
                          className={fieldClassName}
                          aria-label={`Asistencia de ${attendee.athleteName}`}
                        >
                          <option value="">Sin registrar</option>
                          {attendanceStatuses.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={
                          savingEnrollmentId !== null ||
                          loading ||
                          (!retry && !status)
                        }
                        onClick={() => {
                          const command = retry?.body ?? {
                            organizationId,
                            locationId,
                            enrollmentId: attendee.enrollmentId,
                            status: status as AttendanceStatus,
                          };
                          void saveAttendance(
                            attendee.enrollmentId,
                            command,
                            retry
                          );
                        }}
                        className={buttonClassName}
                        aria-label={`${saveAction} de ${attendee.athleteName}`}
                      >
                        {rowBusy
                          ? "Guardando…"
                          : retry
                            ? "Reintentar guardado"
                            : "Guardar asistencia"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
