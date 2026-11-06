import { decodeOwnerUsage } from "./owner-plan-usage-response";

type ArchiveOutcome =
  | { status: "confirmed" | "uncertain"; message: string }
  | { status: "rejected"; message: string; code: string };
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Only an initial rejection emitted by this command, with its actual HTTP status, resolves it.
// In particular, an idempotency conflict must not unlock a new key/body.
const rejectionStatuses = new Map<string, number>([
  ["VALIDATION_ERROR", 400], ["UNAUTHENTICATED", 401],
  ["FORBIDDEN", 403], ["NOT_FOUND", 404],
  ["RESOURCE_NOT_OVER_LIMIT", 409],
]);

/** Unknown or contradictory responses preserve the original intent. */
export function archiveOutcome(response: { ok: boolean; status: number }, payload: unknown, context: { previouslyUncertain?: boolean } = {}): ArchiveOutcome {
  if (response.ok && response.status >= 200 && response.status < 300 && record(payload) && payload.ok === true && record(payload.data) &&
      !["error", "code", "type", "status"].some(field => field in payload) &&
      decodeOwnerUsage({ ok: true, data: { ...payload.data, items: [], next: null } })) {
    return { status: "confirmed", message: "" };
  }
  if (!context.previouslyUncertain && !response.ok && response.status >= 400 && response.status < 500 && record(payload) && !("data" in payload) && payload.type === undefined &&
      payload.status === undefined && text(payload.message) &&
      ((payload.ok === false && typeof payload.code === "string" && payload.error === payload.code &&
        rejectionStatuses.get(payload.code) === response.status) ||
       (response.status === 429 && payload.ok === undefined && payload.code === undefined && payload.error === "RATE_LIMIT_EXCEEDED"))) {
    return { status: "rejected", message: payload.message, code: typeof payload.code === "string" ? payload.code : String(payload.error) };
  }
  return { status: "uncertain", message: "No podemos confirmar si se archivó la ficha. Reintenta el mismo archivo sin recargar esta página; conservaremos la misma solicitud para evitar duplicados." };
}
