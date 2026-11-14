import {
  SKILL_LEVELS_UNAVAILABLE_REASON,
  type AthleteSkillsView,
  type EvaluationResult,
  type SaveTemplateCommand,
  type SkillRosterView,
  type SkillTemplateView,
  type SkillTemplatesListView,
  type WriteResult,
} from "@/modules/skill-levels/domain/skill-levels";

/**
 * Cliente de las rutas de niveles y progresión. Todas las respuestas usan
 * apiSuccess/problem+json; aquí solo se desempaqueta `data` y se traduce el
 * 503 «no disponible» (bandera apagada o candidato SQL sin aplicar).
 */

export type SkillFetchResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable" }
  | { status: "error"; message: string; code: number };

export const SKILL_UNAVAILABLE_MESSAGE = "Los niveles y la progresión todavía no están disponibles en tu academia.";

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

async function request<T>(url: string, init?: RequestInit): Promise<SkillFetchResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    return { status: "error", message: GENERIC_ERROR, code: 0 };
  }
  const payload: unknown = await response.json().catch(() => null);
  // Solo el 503 de la función apagada o sin migrar es «no disponible»; cualquier
  // otro 503 (por ejemplo, el uso del plan no se pudo comprobar) es un error.
  if (response.status === 503 && unavailableReason(payload) === SKILL_LEVELS_UNAVAILABLE_REASON) {
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

function jsonInit(method: "POST" | "PUT", body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export type SkillScope = { organizationId: string; locationId: string };

export function newClientRequestId(): string {
  return crypto.randomUUID();
}

export function fetchTemplates(scope: SkillScope, includeArchived = false) {
  const params = new URLSearchParams({ ...scope, ...(includeArchived ? { includeArchived: "true" } : {}) });
  return request<SkillTemplatesListView>(`/api/v1/owner/skill-templates?${params.toString()}`);
}

export function fetchTemplate(scope: SkillScope, templateId: string) {
  const params = new URLSearchParams(scope);
  return request<SkillTemplateView>(
    `/api/v1/owner/skill-templates/${encodeURIComponent(templateId)}?${params.toString()}`
  );
}

export type CreateTemplateBody =
  | { source: "blank"; discipline: string; name: string; description?: string | null }
  | { source: "starter"; starterKey: string; name?: string | null }
  | { source: "copy"; templateId: string; name: string };

export function postTemplate(scope: SkillScope, body: CreateTemplateBody & { clientRequestId: string }) {
  return request<WriteResult>("/api/v1/owner/skill-templates", jsonInit("POST", { ...scope, ...body }));
}

export function putTemplate(
  scope: SkillScope,
  templateId: string,
  body: Omit<SaveTemplateCommand, "organizationId" | "locationId">
) {
  return request<WriteResult>(
    `/api/v1/owner/skill-templates/${encodeURIComponent(templateId)}`,
    jsonInit("PUT", { ...scope, ...body })
  );
}

export function fetchAthleteSkills(scope: SkillScope, athleteId: string, templateId?: string | null) {
  const params = new URLSearchParams({ ...scope, ...(templateId ? { templateId } : {}) });
  return request<AthleteSkillsView>(`/api/v1/owner/athletes/${encodeURIComponent(athleteId)}/skills?${params.toString()}`);
}

export type RosterSource = { kind: "group"; id: string } | { kind: "session"; id: string };

export function fetchRoster(scope: SkillScope, source: RosterSource, templateId: string) {
  const params = new URLSearchParams({ ...scope, templateId });
  const base = source.kind === "group" ? "groups" : "sessions";
  return request<SkillRosterView>(`/api/v1/owner/${base}/${encodeURIComponent(source.id)}/skills?${params.toString()}`);
}

export function postEvaluation(
  scope: SkillScope,
  body: {
    clientRequestId: string;
    templateId: string;
    athleteIds: string[];
    elementIds: string[];
    status: string;
    achievedOn?: string | null;
  }
) {
  return request<EvaluationResult>("/api/v1/owner/skill-evaluations", jsonInit("POST", { ...scope, ...body }));
}

export function postLevelPass(
  scope: SkillScope,
  athleteId: string,
  body: { clientRequestId: string; templateId: string; levelId: string; passedOn?: string | null }
) {
  return request<WriteResult>(
    `/api/v1/owner/athletes/${encodeURIComponent(athleteId)}/skills/level-passes`,
    jsonInit("POST", { ...scope, ...body })
  );
}

export function formatSkillDate(value: string): string {
  // Una fecha civil se pinta tal cual; un instante, en la zona del navegador.
  const civil = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = civil ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", ...(civil ? { timeZone: "UTC" } : {}) }).format(date);
}

/** Enlace a la hoja de una gimnasta, con el contexto de academia y sede. */
export function athleteSheetHref(scope: SkillScope, athleteId: string): string {
  return `/owner/skills/athletes/${encodeURIComponent(athleteId)}?${new URLSearchParams(scope).toString()}`;
}

export function diplomaHref(scope: SkillScope, athleteId: string, passId: string): string {
  return `/owner/skills/diploma/${encodeURIComponent(athleteId)}/${encodeURIComponent(passId)}?${new URLSearchParams(scope).toString()}`;
}
