import {
  ATHLETE_PROGRESS_UNAVAILABLE_REASON,
  type AthleteProgressView,
  type ProgressWriteResult,
} from "@/modules/athlete-progress/domain/athlete-progress";

/**
 * Cliente de las rutas de objetivos y observaciones (P2 #17). Todas las
 * respuestas usan apiSuccess/problem+json; aquí solo se desempaqueta `data` y
 * se traduce un 503 a «no disponible» (candidato SQL sin aplicar).
 */

export type ProgressFetchResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable" }
  | { status: "error"; message: string; code: number };

export const PROGRESS_UNAVAILABLE_MESSAGE =
  "Los objetivos y observaciones todavía no están disponibles en tu academia.";

export const FAMILY_VISIBILITY_HELP =
  "El portal de familias todavía no muestra observaciones. Esta marca solo indica que se podrá compartir.";

const GENERIC_ERROR = "No se ha podido completar la acción. Comprueba la conexión e inténtalo de nuevo.";

function problemDetail(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return null;
}

function unavailableReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("errors" in payload)) return null;
  const errors = (payload as { errors?: unknown }).errors;
  if (!errors || typeof errors !== "object" || !("reason" in errors)) return null;
  const reason = (errors as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

async function request<T>(url: string, init?: RequestInit): Promise<ProgressFetchResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    return { status: "error", message: GENERIC_ERROR, code: 0 };
  }
  const payload: unknown = await response.json().catch(() => null);
  // Solo el 503 de la migración sin aplicar es «no disponible»; cualquier
  // otro 503 (por ejemplo, el uso del plan no se pudo comprobar) es un error.
  if (response.status === 503 && unavailableReason(payload) === ATHLETE_PROGRESS_UNAVAILABLE_REASON) {
    return { status: "unavailable" };
  }
  if (!response.ok) {
    return { status: "error", message: problemDetail(payload) ?? GENERIC_ERROR, code: response.status };
  }
  if (payload && typeof payload === "object" && "data" in payload) {
    return { status: "ok", data: (payload as { data: T }).data };
  }
  return { status: "error", message: GENERIC_ERROR, code: response.status };
}

function jsonInit(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export type ProgressScope = { organizationId: string; locationId: string };

export function fetchAthleteProgress(scope: ProgressScope, athleteId: string) {
  const params = new URLSearchParams(scope);
  return request<AthleteProgressView>(
    `/api/v1/owner/athletes/${encodeURIComponent(athleteId)}/progress?${params.toString()}`
  );
}

export function fetchSessionAthleteProgress(scope: ProgressScope, sessionId: string, enrollmentId: string) {
  const params = new URLSearchParams({ ...scope, enrollmentId });
  return request<AthleteProgressView>(
    `/api/v1/owner/sessions/${encodeURIComponent(sessionId)}/observations?${params.toString()}`
  );
}

export function postObjective(
  scope: ProgressScope,
  athleteId: string,
  body: {
    clientRequestId: string;
    title: string;
    discipline: string | null;
    apparatus: string | null;
    targetDate: string | null;
  }
) {
  return request<ProgressWriteResult>(
    `/api/v1/owner/athletes/${encodeURIComponent(athleteId)}/objectives`,
    jsonInit("POST", { ...scope, ...body })
  );
}

export function postObjectiveStatus(
  scope: ProgressScope,
  athleteId: string,
  objectiveId: string,
  body: { expectedRevision: number; status: string }
) {
  return request<ProgressWriteResult>(
    `/api/v1/owner/athletes/${encodeURIComponent(athleteId)}/objectives/${encodeURIComponent(objectiveId)}/status`,
    jsonInit("POST", { ...scope, ...body })
  );
}

export function postObservation(
  scope: ProgressScope,
  athleteId: string,
  body: { clientRequestId: string; body: string; visibility: string; objectiveId: string | null }
) {
  return request<ProgressWriteResult>(
    `/api/v1/owner/athletes/${encodeURIComponent(athleteId)}/observations`,
    jsonInit("POST", { ...scope, ...body })
  );
}

export function patchObservation(
  scope: ProgressScope,
  athleteId: string,
  observationId: string,
  body: { expectedRevision: number; body: string; visibility: string }
) {
  return request<ProgressWriteResult>(
    `/api/v1/owner/athletes/${encodeURIComponent(athleteId)}/observations/${encodeURIComponent(observationId)}`,
    jsonInit("PATCH", { ...scope, ...body })
  );
}

export function postSessionObservation(
  scope: ProgressScope,
  sessionId: string,
  body: { enrollmentId: string; clientRequestId: string; body: string; visibility: string }
) {
  return request<ProgressWriteResult & { athleteId: string }>(
    `/api/v1/owner/sessions/${encodeURIComponent(sessionId)}/observations`,
    jsonInit("POST", { ...scope, ...body })
  );
}

export function newClientRequestId(): string {
  return crypto.randomUUID();
}

export function formatProgressDate(value: string): string {
  // Una fecha civil se pinta tal cual; un instante, en la zona del navegador.
  const civil = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = civil ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    ...(civil ? { timeZone: "UTC" } : {}),
  }).format(date);
}
