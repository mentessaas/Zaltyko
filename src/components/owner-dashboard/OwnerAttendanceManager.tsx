"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ClipboardCheck, UsersRound } from "lucide-react";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
import { OwnerSessionCoaches } from "./OwnerSessionCoaches";
import { OwnerSessionAthleteProgress } from "./OwnerSessionAthleteProgress";
import { OwnerSessionObservationForm } from "./OwnerSessionObservationForm";
import { ownerUi } from "./owner-ui";
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
type SessionPageState = {
  identity: string;
  sessions: SessionOption[];
  nextCursor: string | null;
  loading: boolean;
  error: string;
  consumedCursors: string[];
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

const fieldClassName = ownerUi.field;
const buttonClassName = ownerUi.primaryButton;


const statusButtonLabel: Record<AttendanceStatus, string> = {
  present: "Presente",
  absent: "Ausente",
  excused: "Justificada",
  late: "Tarde",
};

const statusButtonPressed: Record<AttendanceStatus, string> = {
  present: "border-z-comp-600 bg-z-comp-600 text-white",
  absent: "border-z-chalk-600 bg-z-chalk-600 text-white",
  excused: "border-z-brand-600 bg-z-brand-600 text-white",
  late: "border-amber-700 bg-amber-700 text-white",
};

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toLocaleUpperCase("es");
}

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

function sessionOption(value: unknown): value is SessionOption {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.className === "string" &&
    typeof candidate.startsAt === "string" &&
    !Number.isNaN(Date.parse(candidate.startsAt)) &&
    typeof candidate.timezone === "string" &&
    candidate.timezone.length > 0 &&
    (candidate.retryOnly === undefined ||
      typeof candidate.retryOnly === "boolean")
  );
}

function sessionPageData(
  payload: unknown,
  organizationId: string,
  locationId: string
): { sessions: SessionOption[]; nextCursor: string | null } | null {
  const data = responseData<unknown>(payload);
  if (!data || typeof data !== "object") return null;
  const candidate = data as Record<string, unknown>;
  const organization = candidate.organization;
  if (
    !organization ||
    typeof organization !== "object" ||
    (organization as Record<string, unknown>).id !== organizationId ||
    candidate.locationId !== locationId ||
    !Array.isArray(candidate.sessions) ||
    (candidate.nextCursor !== null &&
      (typeof candidate.nextCursor !== "string" ||
        candidate.nextCursor.length === 0)) ||
    !candidate.sessions.every(sessionOption)
  ) {
    return null;
  }

  const sessions = candidate.sessions as SessionOption[];
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length) {
    return null;
  }

  return {
    sessions,
    nextCursor: candidate.nextCursor as string | null,
  };
}

function sessionPageError(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const detail = "detail" in payload ? payload.detail : undefined;
    const message = "message" in payload ? payload.message : undefined;
    if (typeof detail === "string") return detail;
    if (typeof message === "string") return message;
  }
  return "No se han podido cargar más sesiones. Comprueba la conexión e inténtalo de nuevo.";
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
  initialNextCursor,
  selectedSession: requestedSession,
  coachMode = false,
  progressAvailable = false,
  coachAssignmentAvailable = false,
}: {
  organizationId: string;
  locationId: string;
  sessions: SessionOption[];
  initialSessionId?: string | null;
  initialNextCursor?: string | null;
  selectedSession?: SessionOption | null;
  /** Coach seat (P1 #8): no links to the management panel or the plan. */
  coachMode?: boolean;
  /**
   * P2 #17: el servidor comprobó que las tablas de objetivos y observaciones
   * existen. Sin ellas no se muestran sus accesos.
   */
  progressAvailable?: boolean;
  /**
   * O1: el servidor comprobó que las tablas de titulares y sustituciones
   * existen. Sin ellas no se muestra quién entrena.
   */
  coachAssignmentAvailable?: boolean;
}) {
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const writesBlocked = planPolicy.status !== "ready" || planPolicy.readOnly;
  const initialSessionOptions = useMemo(
    () =>
      requestedSession &&
      !sessions.some((session) => session.id === requestedSession.id)
        ? [...sessions, requestedSession]
        : sessions,
    [requestedSession, sessions]
  );
  const sessionPageIdentity = JSON.stringify([
    organizationId,
    locationId,
    initialSessionId ?? null,
    initialNextCursor ?? null,
    initialSessionOptions,
  ]);
  const initialSessionPageState = useMemo<SessionPageState>(
    () => ({
      identity: sessionPageIdentity,
      sessions: initialSessionOptions,
      nextCursor: initialNextCursor ?? null,
      loading: false,
      error: "",
      consumedCursors: [],
    }),
    [initialNextCursor, initialSessionOptions, sessionPageIdentity]
  );
  const [sessionPageState, setSessionPageState] = useState<SessionPageState>(
    initialSessionPageState
  );
  const pageRequestController = useRef<AbortController | null>(null);
  const pageRequestGeneration = useRef(0);
  const pageRequestLoading = useRef(false);
  const activeSessionPageIdentity = useRef(sessionPageIdentity);
  const sessionPage =
    sessionPageState.identity === sessionPageIdentity
      ? sessionPageState
      : initialSessionPageState;
  const sessionOptions = sessionPage.sessions;

  useCommittedLayoutEffect(() => {
    if (activeSessionPageIdentity.current === sessionPageIdentity) return;
    activeSessionPageIdentity.current = sessionPageIdentity;
    pageRequestGeneration.current += 1;
    pageRequestController.current?.abort();
    pageRequestController.current = null;
    pageRequestLoading.current = false;
    setSessionPageState(initialSessionPageState);
  }, [initialSessionPageState, sessionPageIdentity]);

  useEffect(
    () => () => {
      pageRequestGeneration.current += 1;
      pageRequestController.current?.abort();
      pageRequestController.current = null;
    },
    []
  );

  const selectionScope = JSON.stringify([
    organizationId,
    locationId,
    initialSessionId ?? null,
  ]);
  const initialSelection = initialSessionId
    ? sessionOptions.some((session) => session.id === initialSessionId)
      ? initialSessionId
      : ""
    : (sessionOptions[0]?.id ?? "");
  const [selection, setSelection] = useState({
    scope: selectionScope,
    sessionId: initialSelection,
  });
  const sessionId =
    selection.scope === selectionScope &&
    (selection.sessionId === "" ||
      sessionOptions.some((session) => session.id === selection.sessionId))
      ? selection.sessionId
      : initialSelection;
  const requestedSessionUnavailable = Boolean(
    initialSessionId &&
      !sessionOptions.some((session) => session.id === initialSessionId)
  );
  const selectedSession = sessionOptions.find((session) => session.id === sessionId);
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
  const recordedCount = attendees.filter((attendee) => attendee.attendanceStatus !== null).length;
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

  async function loadMoreSessions() {
    const cursor = sessionPage.nextCursor;
    if (!cursor || sessionPage.loading || pageRequestLoading.current) return;

    pageRequestLoading.current = true;
    pageRequestController.current?.abort();
    const controller = new AbortController();
    pageRequestController.current = controller;
    const requestGeneration = ++pageRequestGeneration.current;
    const requestIdentity = sessionPageIdentity;
    const params = new URLSearchParams({
      organizationId,
      locationId,
      cursor,
    });
    setSessionPageState((current) =>
      current.identity === requestIdentity
        ? { ...current, loading: true, error: "" }
        : current
    );

    const isCurrentRequest = () =>
      !controller.signal.aborted &&
      pageRequestGeneration.current === requestGeneration &&
      activeSessionPageIdentity.current === requestIdentity;

    try {
      const response = await fetch(
        `/api/v1/owner/attendance/sessions?${params.toString()}`,
        { cache: "no-store", signal: controller.signal }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(sessionPageError(payload));
      const page = sessionPageData(payload, organizationId, locationId);
      if (!page) {
        throw new Error(
          "La respuesta de sesiones no coincide con esta academia y sede. Vuelve a intentarlo."
        );
      }
      if (
        page.nextCursor !== null &&
        (page.nextCursor === cursor ||
          sessionPage.consumedCursors.includes(page.nextCursor))
      ) {
        throw new Error(
          "La paginación no avanzó de forma segura. Vuelve a intentarlo más tarde."
        );
      }
      if (!isCurrentRequest()) return;

      setSessionPageState((current) => {
        if (current.identity !== requestIdentity) return current;
        const knownIds = new Set(current.sessions.map((session) => session.id));
        return {
          ...current,
          sessions: [
            ...current.sessions,
            ...page.sessions.filter((session) => !knownIds.has(session.id)),
          ],
          nextCursor: page.nextCursor,
          consumedCursors: [...current.consumedCursors, cursor],
          loading: false,
          error: "",
        };
      });
    } catch (cause) {
      if (!isCurrentRequest()) return;
      setSessionPageState((current) =>
        current.identity === requestIdentity
          ? {
              ...current,
              loading: false,
              error:
                cause instanceof Error && cause.name !== "TypeError"
                  ? cause.message
                  : "No se han podido cargar más sesiones. Comprueba la conexión e inténtalo de nuevo.",
            }
          : current
      );
    } finally {
      if (pageRequestGeneration.current === requestGeneration) {
        pageRequestLoading.current = false;
        pageRequestController.current = null;
      }
    }
  }

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
    <main className={ownerUi.page}>
      <div className="mx-auto grid max-w-4xl gap-6">
        <header className="grid gap-4">
          {coachMode ? null : (
            <Link
              href={`/owner?organizationId=${encodeURIComponent(organizationId)}&locationId=${encodeURIComponent(locationId)}`}
              className={ownerUi.backLink}
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              Volver al resumen
            </Link>
          )}
          <div>
            <p className={ownerUi.eyebrow}>Pase de lista</p>
            <h1 className={ownerUi.pageTitle}>Asistencia de la sesión</h1>
            <p className={ownerUi.pageLead}>
              Marca la asistencia de las gimnastas inscritas. Los cambios se
              guardan individualmente.
            </p>
          </div>
        </header>

        <OwnerOperationalReadOnlyNotice
          organizationId={organizationId}
          subscriptionLinks={!coachMode}
        />

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
                className={ownerUi.noticeWarning}
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

        {sessionOptions.length === 0 &&
        !initialSessionId &&
        !sessionPage.nextCursor &&
        !sessionPage.loading &&
        !sessionPage.error ? (
          <div className={ownerUi.emptyState}>
            <span aria-hidden="true" className={ownerUi.emptyIcon}>
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <p className="max-w-md text-sm leading-6 text-z-soft">
              Aún no hay sesiones para pasar lista. Crea una clase recurrente para
              preparar sus sesiones.
            </p>
          </div>
        ) : (
          <section className={`${ownerUi.card} grid min-w-0 gap-5`}>
            <label className="grid gap-2">
              <span className={ownerUi.label}>Sesión</span>
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
                {sessionOptions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.className} ·{" "}
                    {formatSessionDate(session.startsAt, session.timezone)}
                  </option>
                ))}
              </select>
            </label>
            {sessionPage.loading && (
              <p role="status" aria-live="polite" className="text-sm text-z-soft">
                Cargando más sesiones…
              </p>
            )}
            {sessionPage.error && (
              <div role="alert" className={ownerUi.noticeError}>
                <p>{sessionPage.error}</p>
                <button
                  type="button"
                  onClick={() => void loadMoreSessions()}
                  disabled={sessionPage.loading}
                  className="mt-3 underline underline-offset-2 disabled:opacity-50"
                >
                  Reintentar carga de sesiones
                </button>
              </div>
            )}
            {!sessionPage.error && sessionPage.nextCursor && (
              <button
                type="button"
                onClick={() => void loadMoreSessions()}
                disabled={sessionPage.loading}
                className={buttonClassName}
              >
                {sessionPage.loading ? "Cargando sesiones…" : "Cargar más sesiones"}
              </button>
            )}
            {requestedSessionUnavailable && (
              <p role="status" className={ownerUi.noticeWarning}>
                La sesión solicitada no está disponible en esta sede. No hemos
                seleccionado otra sesión automáticamente.
              </p>
            )}
            {selectedSession && (
              <div className="grid gap-3 rounded-xl bg-z-canvas p-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center">
                <p className="min-w-0 break-words font-display text-lg font-bold tracking-tight text-z-ink">
                  {selectedSession.className} ·{" "}
                  {formatSessionDate(
                    selectedSession.startsAt,
                    selectedSession.timezone
                  )}
                </p>
                {!loading && !loadError && attendees.length > 0 ? (
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-z-ink">
                        {recordedCount} de {attendees.length} marcadas
                      </span>
                      <UsersRound className="h-4 w-4 shrink-0 text-z-soft" aria-hidden="true" />
                    </div>
                    <div
                      className={`mt-1.5 ${ownerUi.meterTrack} bg-white`}
                      role="progressbar"
                      aria-label="Progreso del pase de lista"
                      aria-valuemin={0}
                      aria-valuemax={attendees.length}
                      aria-valuenow={recordedCount}
                    >
                      <div
                        className="h-1.5 rounded-full bg-z-comp-600 transition-[width]"
                        style={{ width: `${Math.round((recordedCount / attendees.length) * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
            {coachAssignmentAvailable && selectedSession ? (
              <OwnerSessionCoaches
                key={selectedSession.id}
                organizationId={organizationId}
                locationId={locationId}
                sessionId={selectedSession.id}
                coachMode={coachMode}
                writesBlocked={writesBlocked}
              />
            ) : null}
            {selectedSession?.retryOnly && (
              <p role="status" className={ownerUi.noticeWarning}>
                Esta sesión solo permite recuperar una asistencia que ya se
                había enviado. No se pueden registrar cambios nuevos aquí.
              </p>
            )}

            {loading && (
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-z-soft"
              >
                Cargando lista…
              </p>
            )}
            {loadError && (
              <div
                role="alert"
                className={ownerUi.noticeError}
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
              <p role="alert" className={ownerUi.noticeError}>
                {retryStorageError}
              </p>
            )}
            {saveError && (
              <p
                role="alert"
                className={ownerUi.noticeError}
              >
                {saveError}
              </p>
            )}

            {notice && (
              <p
                role="status"
                aria-live="polite"
                className={ownerUi.noticeInfo}
              >
                {notice}
              </p>
            )}

            {sessionId && !loading && !loadError && attendees.length === 0 ? (
              <p className="rounded-[12px] border border-z-line bg-z-canvas p-4 text-sm leading-6 text-z-soft">
                No hay gimnastas con inscripción vigente en esta sesión.
              </p>
            ) : sessionId && !loadError ? (
              <ul className="grid gap-2.5">
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
                      className="grid gap-3 rounded-xl border border-z-line bg-white p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-z-brand-50 text-sm font-bold text-z-brand-700"
                        >
                          {initialsOf(attendee.athleteName)}
                        </span>
                        <div className="min-w-0">
                          <span className="block break-words font-semibold text-z-ink">
                            {attendee.athleteName}
                          </span>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:min-w-[26rem]">
                        <div
                          role="group"
                          aria-label={`Asistencia de ${attendee.athleteName}`}
                          className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
                        >
                          {attendanceStatuses.map((option) => {
                            const saved = attendee.attendanceStatus === option.value;
                            const sending = rowBusy && !retry && status === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                aria-pressed={saved}
                                disabled={
                                  Boolean(retry) ||
                                  Boolean(savingForCurrentScope) ||
                                  loading ||
                                  !retryStorageReady ||
                                  writesBlocked ||
                                  Boolean(selectedSession?.retryOnly)
                                }
                                onClick={() => {
                                  if (savingByScopeRef.current[currentScopeKey]) return;
                                  setRosterState((current) =>
                                    current?.scopeKey === currentScopeKey
                                      ? {
                                          ...current,
                                          selectedStatuses: {
                                            ...current.selectedStatuses,
                                            [attendee.enrollmentId]: option.value,
                                          },
                                        }
                                      : current
                                  );
                                  void saveAttendance(attendee.enrollmentId, {
                                    organizationId,
                                    locationId,
                                    enrollmentId: attendee.enrollmentId,
                                    status: option.value,
                                  });
                                }}
                                className={`touch-target inline-flex min-h-12 min-w-0 items-center justify-center rounded-[10px] border px-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${saved ? statusButtonPressed[option.value] : "border-z-line bg-white text-z-ink hover:bg-z-canvas"}`}
                                aria-label={
                                  sending
                                    ? `Guardando asistencia de ${attendee.athleteName}`
                                    : `${option.label}: ${attendee.athleteName}`
                                }
                              >
                                {sending ? "Guardando…" : statusButtonLabel[option.value]}
                              </button>
                            );
                          })}
                        </div>
                        {retry ? (
                          <button
                            type="button"
                            disabled={
                              Boolean(savingForCurrentScope) ||
                              loading ||
                              !retryStorageReady
                            }
                            onClick={() => {
                              void saveAttendance(
                                attendee.enrollmentId,
                                retry.body,
                                retry
                              );
                            }}
                            className={buttonClassName}
                            aria-label={`${saveAction} de ${attendee.athleteName}`}
                          >
                            {rowBusy ? "Guardando…" : "Reintentar guardado"}
                          </button>
                        ) : null}
                        {progressAvailable && sessionId && !selectedSession?.retryOnly ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <OwnerSessionObservationForm
                              organizationId={organizationId}
                              locationId={locationId}
                              sessionId={sessionId}
                              enrollmentId={attendee.enrollmentId}
                              athleteName={attendee.athleteName}
                              disabled={writesBlocked}
                            />
                            <OwnerSessionAthleteProgress
                              organizationId={organizationId}
                              locationId={locationId}
                              sessionId={sessionId}
                              enrollmentId={attendee.enrollmentId}
                              athleteName={attendee.athleteName}
                              readOnly={writesBlocked}
                            />
                          </div>
                        ) : null}
                      </div>
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
                  className="rounded-[12px] grid gap-3 border border-amber-300 bg-amber-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
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
