import { isSaasTimestamp } from "./owner-saas-timestamp";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function date(value: unknown): value is string {
  return typeof value === "string" && value.length === 10 && isSaasTimestamp(`${value}T00:00:00Z`);
}

export type PendingEnrollmentIntent = {
  organizationId: string;
  kind: "create" | "transition";
  enrollmentId?: string;
  key: string;
  endpoint: string;
  method: "POST" | "PATCH";
  body: string;
  description: string;
  previouslyUncertain?: boolean;
};

export function enrollmentIntentStorageKey(organizationId: string): string {
  return `zaltyko:pending-enrollment-command:v1:${organizationId}`;
}

function validEnrollmentIntent(value: unknown, organizationId: string): value is PendingEnrollmentIntent {
  if (!record(value) || value.organizationId !== organizationId ||
      !Object.keys(value).every(key => ["organizationId", "kind", "enrollmentId", "key", "endpoint", "method", "body", "description", "previouslyUncertain"].includes(key)) ||
      (value.previouslyUncertain !== undefined && typeof value.previouslyUncertain !== "boolean") ||
      (value.kind !== "create" && value.kind !== "transition") ||
      typeof value.key !== "string" || value.key.length < 8 || value.key.length > 150 ||
      typeof value.endpoint !== "string" || typeof value.method !== "string" ||
      typeof value.body !== "string" || value.body.length > 16000 ||
      !text(value.description) || value.description.length > 500) return false;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(value.body);
    if (!record(parsed)) return false;
    body = parsed;
  } catch {
    return false;
  }
  if (body.organizationId !== organizationId) return false;
  if (value.kind === "create") {
    return value.method === "POST" && value.endpoint === "/api/v1/owner/enrollments" &&
      value.enrollmentId === undefined && uuid(body.locationId) && uuid(body.athleteId) &&
      uuid(body.classTemplateId) && date(body.startsOn) &&
      (body.pricePlanId === null || uuid(body.pricePlanId)) &&
      Object.keys(body).every(key => ["organizationId", "locationId", "athleteId", "classTemplateId", "startsOn", "pricePlanId"].includes(key));
  }
  return value.method === "PATCH" && uuid(value.enrollmentId) &&
    value.endpoint === `/api/v1/owner/enrollments/${value.enrollmentId}` &&
    Number.isSafeInteger(body.expectedVersion) && Number(body.expectedVersion) > 0 &&
    ["active", "paused", "cancelled", "completed"].includes(String(body.toStatus)) &&
    date(body.effectiveOn) && Object.keys(body).every(key => ["organizationId", "expectedVersion", "toStatus", "effectiveOn"].includes(key));
}

export type PendingEnrollmentIntentRead =
  | { status: "empty" }
  | { status: "pending"; intent: PendingEnrollmentIntent }
  | { status: "invalid" | "unavailable" };

function sameIntent(
  left: PendingEnrollmentIntent,
  right: PendingEnrollmentIntent
): boolean {
  return left.organizationId === right.organizationId &&
    left.kind === right.kind &&
    left.enrollmentId === right.enrollmentId &&
    left.key === right.key &&
    left.endpoint === right.endpoint &&
    left.method === right.method &&
    left.body === right.body &&
    left.description === right.description;
}

export function readPendingEnrollmentIntent(organizationId: string): PendingEnrollmentIntentRead {
  try {
    const serialized = window.sessionStorage.getItem(enrollmentIntentStorageKey(organizationId));
    if (serialized === null) return { status: "empty" };
    const value: unknown = JSON.parse(serialized);
    if (!record(value) || value.version !== 1 ||
        !Object.keys(value).every(key => ["version", "intent"].includes(key)) ||
        !validEnrollmentIntent(value.intent, organizationId)) {
      return { status: "invalid" };
    }
    // A page reload cannot establish whether the previous network request committed.
    return { status: "pending", intent: { ...value.intent, previouslyUncertain: true } };
  } catch {
    return { status: "unavailable" };
  }
}

export function persistPendingEnrollmentIntent(intent: PendingEnrollmentIntent): boolean {
  if (!validEnrollmentIntent(intent, intent.organizationId)) return false;
  const existing = readPendingEnrollmentIntent(intent.organizationId);
  if (existing.status === "pending") return sameIntent(existing.intent, intent);
  if (existing.status !== "empty") return false;
  try {
    window.sessionStorage.setItem(enrollmentIntentStorageKey(intent.organizationId), JSON.stringify({
      version: 1,
      intent: {
        organizationId: intent.organizationId,
        kind: intent.kind,
        ...(intent.enrollmentId ? { enrollmentId: intent.enrollmentId } : {}),
        key: intent.key,
        endpoint: intent.endpoint,
        method: intent.method,
        body: intent.body,
        description: intent.description,
      },
    }));
    const saved = readPendingEnrollmentIntent(intent.organizationId);
    return saved.status === "pending" && sameIntent(saved.intent, intent);
  } catch {
    return false;
  }
}

export function clearPendingEnrollmentIntent(intent: PendingEnrollmentIntent): boolean {
  const current = readPendingEnrollmentIntent(intent.organizationId);
  if (current.status === "empty") return true;
  if (current.status !== "pending" || !sameIntent(current.intent, intent)) return false;
  try {
    window.sessionStorage.removeItem(enrollmentIntentStorageKey(intent.organizationId));
    return readPendingEnrollmentIntent(intent.organizationId).status === "empty";
  } catch {
    return false;
  }
}

// Exact Problem types and statuses from the enrollment command routes/services.
// Unknown errors (including idempotency-conflict) cannot authorize a new intent.
const rejectionStatuses = new Map<string, readonly number[]>([
  ["authentication-required", [401]],
  ["invalid-enrollment-command", [400]], ["invalid-enrollment-transition", [400]],
  ["forbidden", [403]], ["location-scope-denied", [403]], ["not-found", [404]],
  ["version-conflict", [409]], ["invalid-state-transition", [409]],
  ["capacity-full", [409]], ["plan-over-capacity", [409]],
  ["duplicate-open-enrollment", [409]], ["invalid-date-range", [409, 422]],
  ["invalid-relation", [409]], ["price-plan-not-available", [422]],
  ["price-assignment-exists", [409]], ["price-assignment-date-conflict", [409]],
].map(([type, statuses]) => [`https://zaltyko.com/problems/${type}`, statuses] as [string, readonly number[]]));

export function enrollmentCommandOutcome(response: { ok: boolean; status: number }, payload: unknown, expectedId?: string, context: { previouslyUncertain?: boolean; expectedCreateBody?: string; expectedIdempotencyKey?: string } = {}): { status: "confirmed" | "rejected" | "uncertain"; message: string } {
  const data = record(payload) && payload.ok === true && record(payload.data) &&
    !["error", "code", "type", "status"].some(field => field in payload) ? payload.data : null;
  let expectedCreate: Record<string, unknown> | null = null;
  if (expectedId === undefined && typeof context.expectedCreateBody === "string") {
    try {
      const parsed: unknown = JSON.parse(context.expectedCreateBody);
      if (record(parsed) && date(parsed.startsOn) && (parsed.pricePlanId === null || uuid(parsed.pricePlanId))) expectedCreate = parsed;
    } catch { /* An invalid saved command cannot confirm a create response. */ }
  }
  const receipt = data && record(data.commandReceipt) ? data.commandReceipt : null;
  const receiptMatches = expectedCreate !== null && receipt !== null &&
    Object.keys(receipt).sort().join(",") === "body,idempotencyKey" &&
    receipt.body === context.expectedCreateBody && receipt.idempotencyKey === context.expectedIdempotencyKey;
  const createFieldsValid = data !== null && date(data.startsOn) && (data.pricePlanId === null || uuid(data.pricePlanId));
  const createFieldsMatch = expectedCreate !== null && data !== null &&
    data.startsOn === expectedCreate.startsOn && data.pricePlanId === expectedCreate.pricePlanId;
  const routeFieldsValid = data && (expectedId === undefined
    ? receiptMatches && createFieldsValid && (context.previouslyUncertain === true || createFieldsMatch)
    : uuid(expectedId) && data.id === expectedId && (data.endsOn === null || date(data.endsOn)));
  const createStatusValid = expectedId !== undefined || context.previouslyUncertain === true || data?.status === "pending";
  if (response.ok && response.status >= 200 && response.status < 300 && data && uuid(data.id) && routeFieldsValid &&
      typeof data.version === "number" && Number.isSafeInteger(data.version) && data.version > 0 &&
      typeof data.status === "string" && ["pending", "trial", "active", "paused", "cancelled", "completed"].includes(data.status) && createStatusValid && date(data.startsOn)) {
    // An idempotent replay can return the enrollment's newer current state.
    return { status: "confirmed", message: "" };
  }
  if (!context.previouslyUncertain && !response.ok && record(payload) && payload.ok === undefined && !("data" in payload)) {
    const problem = payload.status === response.status && payload.error === undefined && payload.code === undefined && typeof payload.type === "string" &&
      rejectionStatuses.get(payload.type)?.includes(response.status) && text(payload.title) && text(payload.detail);
    if (problem) {
      return { status: "rejected", message: payload.detail as string };
    }
    if (response.status === 429 && payload.error === "RATE_LIMIT_EXCEEDED" && payload.type === undefined &&
        payload.status === undefined && payload.code === undefined && text(payload.message)) {
      return { status: "rejected", message: payload.message };
    }
  }
  return { status: "uncertain", message: "No sabemos si se guardó. Reintenta la misma operación sin recargar esta página; conservaremos sus datos y su clave para evitar duplicados." };
}
