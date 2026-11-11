import {
  SESSION_PLANS_UNAVAILABLE_REASON,
  type BlockKind,
  type BlockMarkResult,
  type PlanApparatus,
  type PlanDiscipline,
  type SessionPlanPageView,
  type SessionPlanWriteResult,
} from "@/modules/session-plans/domain/session-plan";

/**
 * Cliente de las rutas de planificación (P2 #17, segunda parte). Las
 * respuestas usan apiSuccess/problem+json: aquí solo se desempaqueta `data` y
 * se traduce el 503 del candidato sin aplicar a «no disponible».
 */

export type PlanFetchResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable" }
  | { status: "error"; message: string; code: number };

export const PLAN_UNAVAILABLE_MESSAGE = "El guion de las sesiones todavía no está disponible en tu academia.";

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

async function request<T>(url: string, init?: RequestInit): Promise<PlanFetchResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    return { status: "error", message: GENERIC_ERROR, code: 0 };
  }
  const payload: unknown = await response.json().catch(() => null);
  // Solo el 503 del candidato sin aplicar es «no disponible»; cualquier otro
  // 503 es un error.
  if (response.status === 503 && unavailableReason(payload) === SESSION_PLANS_UNAVAILABLE_REASON) {
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

function putJson(body: unknown): RequestInit {
  return { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export type PlanScope = { organizationId: string; locationId: string };

export type BlockDraft = {
  id: string | null;
  kind: BlockKind;
  discipline: PlanDiscipline | null;
  apparatus: PlanApparatus | null;
  content: string;
  durationMinutes: number | null;
};

export function fetchSessionPlan(scope: PlanScope, sessionId: string) {
  const params = new URLSearchParams(scope);
  return request<SessionPlanPageView>(
    `/api/v1/owner/sessions/${encodeURIComponent(sessionId)}/plan?${params.toString()}`
  );
}

export function putSessionPlan(
  scope: PlanScope,
  sessionId: string,
  body: {
    clientRequestId: string;
    expectedRevision: number | null;
    source: "manual" | "template";
    focus: string | null;
    note: string | null;
    blocks: BlockDraft[];
    objectiveIds: string[];
  }
) {
  return request<SessionPlanWriteResult>(
    `/api/v1/owner/sessions/${encodeURIComponent(sessionId)}/plan`,
    putJson({ ...scope, ...body })
  );
}

export function putBlockDone(scope: PlanScope, sessionId: string, blockId: string, done: boolean) {
  return request<BlockMarkResult>(
    `/api/v1/owner/sessions/${encodeURIComponent(sessionId)}/plan/blocks/${encodeURIComponent(blockId)}`,
    putJson({ ...scope, done })
  );
}

export function putClassPlanTemplate(
  scope: PlanScope,
  classTemplateId: string,
  body: {
    expectedRevision: number | null;
    focus: string | null;
    note: string | null;
    blocks: Array<Omit<BlockDraft, "id">>;
  }
) {
  return request<SessionPlanWriteResult>(
    `/api/v1/owner/classes/${encodeURIComponent(classTemplateId)}/plan-template`,
    putJson({ ...scope, ...body })
  );
}
