import {
  COACH_ASSIGNMENT_UNAVAILABLE_REASON,
  type ClassCoachesView,
  type ClassCoachesWriteResult,
  type SessionCoachesView,
  type SessionCoachesWriteResult,
  type SubstitutionReason,
} from "@/modules/coach-assignment/domain/coach-assignment";

/**
 * Cliente de las rutas de titulares por clase y sustitución por sesión (O1).
 * Las respuestas usan apiSuccess/problem+json; aquí solo se desempaqueta
 * `data` y se traduce el 503 del candidato sin aplicar a «no disponible».
 */

export type CoachFetchResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable" }
  | { status: "error"; message: string; code: number };

export const COACH_ASSIGNMENT_UNAVAILABLE_MESSAGE =
  "La asignación de titulares todavía no está disponible en tu academia.";

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

async function request<T>(url: string, init?: RequestInit): Promise<CoachFetchResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    return { status: "error", message: GENERIC_ERROR, code: 0 };
  }
  const payload: unknown = await response.json().catch(() => null);
  // Solo el 503 del candidato sin aplicar es «no disponible»; cualquier otro
  // 503 (por ejemplo, el uso del plan no se pudo comprobar) es un error.
  if (response.status === 503 && unavailableReason(payload) === COACH_ASSIGNMENT_UNAVAILABLE_REASON) {
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

function putInit(body: unknown): RequestInit {
  return { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function fetchClassCoaches(input: { organizationId: string; locationId: string; classTemplateId: string }) {
  const params = new URLSearchParams({ organizationId: input.organizationId, locationId: input.locationId });
  return request<ClassCoachesView>(
    `/api/v1/owner/classes/${encodeURIComponent(input.classTemplateId)}/coaches?${params.toString()}`
  );
}

export function putClassCoaches(input: {
  organizationId: string;
  locationId: string;
  classTemplateId: string;
  clientRequestId: string;
  staffProfileIds: string[];
  expectedStaffProfileIds: string[];
}) {
  const { classTemplateId, ...body } = input;
  return request<ClassCoachesWriteResult>(
    `/api/v1/owner/classes/${encodeURIComponent(classTemplateId)}/coaches`,
    putInit(body)
  );
}

export function fetchSessionCoaches(input: { organizationId: string; locationId: string; sessionId: string }) {
  const params = new URLSearchParams({ organizationId: input.organizationId, locationId: input.locationId });
  return request<SessionCoachesView>(
    `/api/v1/owner/sessions/${encodeURIComponent(input.sessionId)}/coaches?${params.toString()}`
  );
}

export function putSessionCoaches(input: {
  organizationId: string;
  locationId: string;
  sessionId: string;
  clientRequestId: string;
  staffProfileIds: string[];
  expectedStaffProfileIds: string[];
  reason: SubstitutionReason | null;
}) {
  const { sessionId, ...body } = input;
  return request<SessionCoachesWriteResult>(
    `/api/v1/owner/sessions/${encodeURIComponent(sessionId)}/coaches`,
    putInit(body)
  );
}

export function newClientRequestId(): string {
  return crypto.randomUUID();
}

export function formatCoachNames(names: readonly string[]): string {
  return new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(names);
}

export function formatChangedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
