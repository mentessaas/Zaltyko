"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import {
  clearAttendanceRetry,
  isDefinitiveAttendanceRejection,
  persistAttendanceRetry,
  readAttendanceRetries,
  validAttendanceReceipt,
  type AttendanceRetryRequest,
} from "./owner-attendance-command";

const useCommittedLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  retryOnly?: boolean;
};
type AttendanceCommand = {
  organizationId: string;
  locationId: string;
  enrollmentId: string;
  status: AttendanceStatus;
};
type RetryRequest = AttendanceRetryRequest;

type AttendanceRosterState = {
  scopeKey: string;
  loading: boolean;
  items: AttendanceItem[];
  selectedStatuses: Record<string, AttendanceStatus | "">;
  error: string;
};
type AttendanceWrite = { enrollmentId: string; token: symbol };

function attendanceScopeKey(
  organizationId: string,
  locationId: string,
  sessionId: string
) {
  return JSON.stringify([organizationId, locationId, sessionId]);
}

function retryScopeKey(request: RetryRequest) {
  return attendanceScopeKey(
    request.body.organizationId,
    request.body.locationId,
    request.sessionId
  );
}

function retryRequestKey(request: RetryRequest) {
  return JSON.stringify([
    request.body.organizationId,
    request.body.locationId,
    request.sessionId,
    request.body.enrollmentId,
  ]);
}

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
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const writesBlocked = planPolicy.status !== "ready" || planPolicy.readOnly;
  const selectionScope = JSON.stringify([
    organizationId,
    locationId,
    initialSessionId ?? null,
  ]);
  const initialSelection = initialSessionId
    ? sessions.some((session) => session.id === initialSessionId)
      ? initialSessionId
      : ""
    : (sessions[0]?.id ?? "");
  const [selection, setSelection] = useState({
    scope: selectionScope,
    sessionId: initialSelection,
  });
  const sessionId =
    selection.scope === selectionScope &&
    (selection.sessionId === "" ||
      sessions.some((session) => session.id === selection.sessionId))
      ? selection.sessionId
      : initialSelection;
  const requestedSessionUnavailable = Boolean(
    initialSessionId &&
      !sessions.some((session) => session.id === initialSessionId)
  );
  const selectedSession = sessions.find((session) => session.id === sessionId);
  const currentScopeKey = attendanceScopeKey(
    organizationId,
    locationId,
    sessionId
  );
  const activeScopeKeyRef = useRef(currentScopeKey);
  useCommittedLayoutEffect(() => {
    activeScopeKeyRef.current = currentScopeKey;
  }, [currentScopeKey]);
  const [rosterState, setRosterState] =
    useState<AttendanceRosterState | null>(null);
  const attendees =
    rosterState?.scopeKey === currentScopeKey ? rosterState.items : [];
  const selectedStatuses =
    rosterState?.scopeKey === currentScopeKey
      ? rosterState.selectedStatuses
      : {};
  const loading =
    sessionId !== "" &&
    (rosterState?.scopeKey !== currentScopeKey || rosterState.loading);
  const loadError =
    rosterState?.scopeKey === currentScopeKey ? rosterState.error : "";
  const [retryRequests, setRetryRequests] = useState<Record<string, RetryRequest>>({});
  const [retryStorageReady, setRetryStorageReady] = useState(false);
  const [retryStorageError, setRetryStorageError] = useState("");
  const [savingByScope, setSavingByScope] = useState<
    Record<string, AttendanceWrite>
  >({});
  const savingByScopeRef = useRef<Record<string, AttendanceWrite>>({});
  const savingForCurrentScope = savingByScope[currentScopeKey];
  const pendingRetries = Object.values(retryRequests);
  const retryForCurrentScope = pendingRetries.some(
    (retry) => retryScopeKey(retry) === currentScopeKey
  );
  const [saveFeedback, setSaveFeedback] = useState({
    scopeKey: currentScopeKey,
    error: "",
    notice: "",
  });
  const saveError =
    saveFeedback.scopeKey === currentScopeKey ? saveFeedback.error : "";
  const notice =
    saveFeedback.scopeKey === currentScopeKey ? saveFeedback.notice : "";
  const [refreshKey, setRefreshKey] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    const stored = readAttendanceRetries(window.sessionStorage);
    if (stored.status === "ready") {
      setRetryRequests(Object.fromEntries(stored.requests.map((request) => [retryRequestKey(request), request])));
      setRetryStorageReady(true);
    } else {
      setRetryStorageError(stored.status === "invalid"
        ? "Hay una asistencia pendiente local dañada. No enviaremos otro cambio hasta recuperar su estado."
        : "El navegador no permite recuperar la asistencia pendiente. No enviaremos cambios hasta poder guardar el reintento.");
    }
  }, []);

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
          setRosterState({
            scopeKey: currentScopeKey,
            loading: false,
            items: data.items,
            selectedStatuses: Object.fromEntries(
              data.items.map((item) => [
                item.enrollmentId,
                item.attendanceStatus ?? "",
              ])
            ),
            error: "",
          });
        }
      })
      .catch((cause: unknown) => {
        if (requestSequence.current === requestId) {
          setRosterState({
            scopeKey: currentScopeKey,
            loading: false,
            items: [],
            selectedStatuses: {},
            error:
              cause instanceof Error && cause.name !== "TypeError"
                ? cause.message
                : "No se ha podido cargar la lista. Comprueba la conexión e inténtalo de nuevo.",
          });
        }
      });

    return () => {
      requestSequence.current += 1;
    };
  }, [currentScopeKey, locationId, organizationId, refreshKey, sessionId]);

  async function saveAttendance(
    enrollmentId: string,
    command: AttendanceCommand,
    retry?: RetryRequest
  ) {
    if (
      !retryStorageReady ||
      (writesBlocked && !retry) ||
      (selectedSession?.retryOnly && !retry)
    ) {
      return;
    }
    const request = retry ?? {
      key: `owner-attendance:${crypto.randomUUID()}`,
      body: command,
      sessionId,
      uncertain: false,
    };
    if (retry && retryScopeKey(retry) !== currentScopeKey) return;
    const requestScopeKey = retryScopeKey(request);
    if (savingByScopeRef.current[requestScopeKey]) return;
    const requestKey = retryRequestKey(request);
    const wasUncertainBeforeThisAttempt = retry?.uncertain ?? false;
    const inFlightRequest = { ...request, uncertain: true };
    if (!persistAttendanceRetry(window.sessionStorage, inFlightRequest)) {
      setSaveFeedback({ scopeKey: requestScopeKey, error: "No se pudo guardar de forma segura el reintento; no se ha enviado la asistencia.", notice: "" });
      return;
    }
    const writeToken = Symbol("attendance-write");
    let definitivelyRejected = false;
    const nextSavingByScope = {
      ...savingByScopeRef.current,
      [requestScopeKey]: { enrollmentId, token: writeToken },
    };
    savingByScopeRef.current = nextSavingByScope;
    setSavingByScope(nextSavingByScope);
    setSaveFeedback({ scopeKey: requestScopeKey, error: "", notice: "" });
    setRetryRequests((current) => ({ ...current, [requestKey]: inFlightRequest }));
    try {
      const response = await fetch(
        `/api/v1/owner/sessions/${encodeURIComponent(request.sessionId)}/attendance`,
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
        if (isDefinitiveAttendanceRejection(response.status, payload, wasUncertainBeforeThisAttempt)) {
          if (clearAttendanceRetry(window.sessionStorage, request)) {
            definitivelyRejected = true;
            setRetryRequests((current) => {
              const next = { ...current };
              delete next[requestKey];
              return next;
            });
          }
        } else {
          const uncertainRequest = { ...request, uncertain: true };
          persistAttendanceRetry(window.sessionStorage, uncertainRequest);
          setRetryRequests((current) => ({ ...current, [requestKey]: uncertainRequest }));
        }
        throw new Error(
          !isDefinitiveAttendanceRejection(response.status, payload, wasUncertainBeforeThisAttempt)
            ? "No sabemos si se guardó. Reintenta este mismo envío para evitar duplicados."
            : responseError(payload)
        );
      }

      if (!validAttendanceReceipt(payload, request)) {
        const uncertainRequest = { ...request, uncertain: true };
        persistAttendanceRetry(window.sessionStorage, uncertainRequest);
        setRetryRequests((current) => ({ ...current, [requestKey]: uncertainRequest }));
        throw new Error("No hemos podido validar el recibo. Reintenta este mismo envío para evitar duplicados.");
      }

      if (!clearAttendanceRetry(window.sessionStorage, request)) {
        const uncertainRequest = { ...request, uncertain: true };
        persistAttendanceRetry(window.sessionStorage, uncertainRequest);
        setRetryRequests((current) => ({ ...current, [requestKey]: uncertainRequest }));
        throw new Error("El servidor respondió, pero no se pudo cerrar el reintento guardado. Vuelve a intentarlo con la misma solicitud.");
      }

      setRetryRequests((current) => {
        const next = { ...current };
        delete next[requestKey];
        return next;
      });
      if (activeScopeKeyRef.current === requestScopeKey) {
        setRosterState((current) =>
          current?.scopeKey === requestScopeKey
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.enrollmentId === enrollmentId
                    ? { ...item, attendanceStatus: request.body.status }
                    : item
                ),
              }
            : current
        );
        setSaveFeedback({
          scopeKey: requestScopeKey,
          error: "",
          notice: "Asistencia guardada.",
        });
      }
    } catch (cause) {
      if (!definitivelyRejected) {
        const uncertainRequest = { ...request, uncertain: true };
        persistAttendanceRetry(window.sessionStorage, uncertainRequest);
        setRetryRequests((current) => ({ ...current, [requestKey]: uncertainRequest }));
      }
      if (activeScopeKeyRef.current === requestScopeKey) {
        setSaveFeedback({
          scopeKey: requestScopeKey,
          error:
            cause instanceof Error && cause.name !== "TypeError"
              ? cause.message
              : "No sabemos si se guardó. Reintenta este mismo envío para evitar duplicados.",
          notice: "",
        });
      }
    } finally {
      const current = savingByScopeRef.current;
      if (current[requestScopeKey]?.token === writeToken) {
        const next = { ...current };
        delete next[requestScopeKey];
        savingByScopeRef.current = next;
        setSavingByScope(next);
      }
    }
  }

  const orphanRetries = pendingRetries.filter(
    (retry) =>
      retryScopeKey(retry) === currentScopeKey &&
      !attendees.some(
        (attendee) => attendee.enrollmentId === retry.body.enrollmentId
      )
  );

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

        <OwnerOperationalReadOnlyNotice organizationId={organizationId} />

        {pendingRetries
          .filter((retry) => retryScopeKey(retry) !== currentScopeKey)
          .map((retry) => {
            const params = new URLSearchParams({
              organizationId: retry.body.organizationId,
              locationId: retry.body.locationId,
              sessionId: retry.sessionId,
            });
            return (
              <p
                key={retryRequestKey(retry)}
                role="status"
                className="border border-amber-500 bg-amber-50 p-4 text-sm text-amber-950"
              >
                Hay una asistencia cuyo resultado sigue sin confirmar en otra
                sesión. Conservamos la solicitud original; vuelve a su ámbito
                para reintentarla sin cambiar la clave ni los datos.{" "}
                <Link
                  className="font-bold underline underline-offset-2"
                  href={`/owner/attendance?${params.toString()}`}
                >
                  Volver a esa sesión
                </Link>
              </p>
            );
          })}

        {sessions.length === 0 && !initialSessionId ? (
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
                  setSelection({
                    scope: selectionScope,
                    sessionId: nextSessionId,
                  });
                }}
                disabled={Boolean(savingForCurrentScope) || retryForCurrentScope}
                className={fieldClassName}
                aria-label="Seleccionar sesión"
              >
                <option value="">Selecciona una sesión</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.className} ·{" "}
                    {formatSessionDate(session.startsAt, session.timezone)}
                  </option>
                ))}
              </select>
            </label>
            {requestedSessionUnavailable && (
              <p role="status" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                La sesión solicitada no está disponible en esta sede. No hemos
                seleccionado otra sesión automáticamente.
              </p>
            )}
            {selectedSession && (
              <p className="text-sm text-slate-600">
                {selectedSession.className} ·{" "}
                {formatSessionDate(
                  selectedSession.startsAt,
                  selectedSession.timezone
                )}
              </p>
            )}
            {selectedSession?.retryOnly && (
              <p role="status" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                Esta sesión solo permite recuperar una asistencia que ya se
                había enviado. No se pueden registrar cambios nuevos aquí.
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
                    setRosterState({
                      scopeKey: currentScopeKey,
                      loading: true,
                      items: [],
                      selectedStatuses: {},
                      error: "",
                    });
                    setRefreshKey((current) => current + 1);
                  }}
                  className="mt-3 underline underline-offset-2"
                >
                  Volver a intentar
                </button>
              </div>
            )}
            {retryStorageError && (
              <p role="alert" className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                {retryStorageError}
              </p>
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

            {sessionId && !loading && !loadError && attendees.length === 0 ? (
              <p className="border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                No hay gimnastas con inscripción vigente en esta sesión.
              </p>
            ) : sessionId && !loadError ? (
              <ul className="divide-y divide-slate-200 border-y border-slate-200">
                {attendees.map((attendee) => {
                  const retry = pendingRetries.find(
                    (candidate) =>
                      candidate.body.organizationId === organizationId &&
                      candidate.body.locationId === locationId &&
                      candidate.sessionId === sessionId &&
                      candidate.body.enrollmentId === attendee.enrollmentId
                  );
                  const status = selectedStatuses[attendee.enrollmentId] ?? "";
                  const rowBusy =
                    savingForCurrentScope?.enrollmentId === attendee.enrollmentId;
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
                            Boolean(savingForCurrentScope) ||
                            loading ||
                            Boolean(selectedSession?.retryOnly)
                          }
                          onChange={(event) => {
                            setRosterState((current) =>
                              current?.scopeKey === currentScopeKey
                                ? {
                                    ...current,
                                    selectedStatuses: {
                                      ...current.selectedStatuses,
                                      [attendee.enrollmentId]: event.target
                                        .value as AttendanceStatus | "",
                                    },
                                  }
                                : current
                            );
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
                          Boolean(savingForCurrentScope) ||
                          loading ||
                          !retryStorageReady ||
                          (writesBlocked && !retry) ||
                          (selectedSession?.retryOnly && !retry) ||
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
            {sessionId && !loading && !loadError && orphanRetries.map((retry) => {
              const rowBusy = Boolean(savingForCurrentScope);
              return (
                <div
                  key={retryRequestKey(retry)}
                  className="grid gap-3 border border-amber-300 bg-amber-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <p className="text-sm leading-6 text-amber-950">
                    Hay una asistencia pendiente para una inscripción que ya no
                    aparece en la lista. Solo reenviaremos la solicitud original.
                  </p>
                  <button
                    type="button"
                    disabled={rowBusy || !retryStorageReady}
                    onClick={() =>
                      void saveAttendance(
                        retry.body.enrollmentId,
                        retry.body,
                        retry
                      )
                    }
                    className={buttonClassName}
                    aria-label="Reintentar asistencia pendiente"
                  >
                    {rowBusy ? "Reintentando…" : "Reintentar envío original"}
                  </button>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
