import { isValidDateString } from "@/lib/validation/date-utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValidDateString(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export type OwnerClassCreateReceipt = {
  id: string;
  name: string;
  sessionCount: number;
  generatedThrough: string;
};

export type PendingOwnerClassCreate = {
  version: 1;
  organizationId: string;
  key: string;
  body: string;
  previouslyUncertain: boolean;
  blocked: boolean;
};

export type PendingOwnerClassCreateRead =
  | { status: "empty" }
  | { status: "pending"; command: PendingOwnerClassCreate }
  | { status: "invalid" | "unavailable" };

export function ownerClassCreateStorageKey(organizationId: string): string {
  return `zaltyko:pending-class-create:v1:${organizationId}`;
}

function validCommandBody(body: unknown, organizationId: string): boolean {
  if (typeof body !== "string") return false;
  try {
    const value = JSON.parse(body) as Record<string, unknown>;
    return !!value && typeof value === "object" && !Array.isArray(value) &&
      value.organizationId === organizationId &&
      typeof value.locationId === "string" && UUID_PATTERN.test(value.locationId) &&
      (value.programId === null || (typeof value.programId === "string" && UUID_PATTERN.test(value.programId))) &&
      typeof value.name === "string" && value.name.trim().length >= 2 &&
      typeof value.capacity === "number" && Number.isSafeInteger(value.capacity) && value.capacity > 0 &&
      typeof value.effectiveFrom === "string" && isCalendarDate(value.effectiveFrom) &&
      (value.effectiveTo === null || (typeof value.effectiveTo === "string" && isCalendarDate(value.effectiveTo))) &&
      Array.isArray(value.schedule) && value.schedule.length > 0 && value.schedule.length <= 14 &&
      value.schedule.every((slot) => !!slot && typeof slot === "object" &&
        Number.isInteger((slot as Record<string, unknown>).isoWeekday) &&
        Number((slot as Record<string, unknown>).isoWeekday) >= 1 && Number((slot as Record<string, unknown>).isoWeekday) <= 7 &&
        typeof (slot as Record<string, unknown>).startsAtLocal === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test((slot as Record<string, unknown>).startsAtLocal as string) &&
        typeof (slot as Record<string, unknown>).endsAtLocal === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test((slot as Record<string, unknown>).endsAtLocal as string));
  } catch {
    return false;
  }
}

export function readPendingOwnerClassCreate(organizationId: string): PendingOwnerClassCreateRead {
  try {
    const serialized = window.sessionStorage.getItem(ownerClassCreateStorageKey(organizationId));
    if (serialized === null) return { status: "empty" };
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1 ||
      value.organizationId !== organizationId || typeof value.key !== "string" ||
      value.key.length < 8 || value.key.length > 150 ||
      !validCommandBody(value.body, organizationId)) return { status: "invalid" };
    return {
      status: "pending",
      command: {
        version: 1,
        organizationId,
        key: value.key,
        body: value.body as string,
        // Any request restored after a reload may already have reached the server.
        previouslyUncertain: true,
        blocked: value.blocked === 1,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export function persistPendingOwnerClassCreate(command: PendingOwnerClassCreate): boolean {
  try {
    window.sessionStorage.setItem(ownerClassCreateStorageKey(command.organizationId), JSON.stringify({
      version: 1,
      organizationId: command.organizationId,
      key: command.key,
      body: command.body,
      // Reserve the status byte before the first write so conflict state can be
      // persisted without increasing the session record size.
      blocked: command.blocked ? 1 : 0,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingOwnerClassCreate(organizationId: string): void {
  try {
    window.sessionStorage.removeItem(ownerClassCreateStorageKey(organizationId));
  } catch {
    // Storage cleanup is best effort after a definitive server outcome.
  }
}

const definitiveRejectionStatuses = new Map<string, readonly number[]>([
  ["authentication-required", [401]],
  ["invalid-class-command", [400]],
  ["forbidden", [403]],
  ["location-scope-denied", [403, 404]],
  ["not-found", [404]],
  ["invalid-relation", [409, 422]],
  ["capacity-full", [409]],
  ["plan-over-capacity", [409]],
]);

export function ownerClassCreateRejection(
  response: { ok: boolean; status: number },
  payload: unknown,
  previouslyUncertain: boolean
): { status: "rejected" | "uncertain" | "blocked"; message: string } {
  if (!response.ok && response.status === 409 && payload && typeof payload === "object" &&
    !Array.isArray(payload) && !("data" in payload) && !("ok" in payload) &&
    !("error" in payload) && !("code" in payload)) {
    const problem = payload as Record<string, unknown>;
    if (problem.type === "https://zaltyko.com/problems/idempotency-conflict" &&
      problem.status === 409 && typeof problem.title === "string" && problem.title.trim() &&
      typeof problem.detail === "string" && problem.detail.trim()) {
      return {
        status: "blocked",
        message: "El servidor detectó un conflicto con esta clave. No volveremos a enviar la operación. Comprueba la lista actualizada de clases; si la clase no aparece o el resultado no está claro, contacta con soporte antes de iniciar otra creación.",
      };
    }
  }

  if (!previouslyUncertain && !response.ok && payload && typeof payload === "object" &&
    !Array.isArray(payload) && !("data" in payload) && !("ok" in payload) &&
    !("code" in payload)) {
    const problem = payload as Record<string, unknown>;
    const type = typeof problem.type === "string" && problem.type.startsWith("https://zaltyko.com/problems/")
      ? problem.type.slice("https://zaltyko.com/problems/".length) : "";
    if (problem.status === response.status && problem.error === undefined &&
      typeof problem.title === "string" && problem.title.trim() &&
      typeof problem.detail === "string" && problem.detail.trim() &&
      definitiveRejectionStatuses.get(type)?.includes(response.status)) {
      return { status: "rejected", message: problem.detail };
    }
    if (response.status === 429 && problem.error === "RATE_LIMIT_EXCEEDED" &&
      typeof problem.message === "string" && problem.message.trim() &&
      problem.type === undefined && problem.status === undefined && problem.code === undefined) {
      return { status: "rejected", message: problem.message };
    }
  }
  const detail = payload && typeof payload === "object" && "detail" in payload &&
    typeof payload.detail === "string" && payload.detail.trim() ? `${payload.detail} ` : "";
  return {
    status: "uncertain",
    message: `${detail}No sabemos si se guardó. Reintenta este mismo envío; conservaremos el cuerpo y la clave para evitar duplicados.`,
  };
}

export function readOwnerClassCreateReceipt(
  payload: unknown,
  expectedName: string
): OwnerClassCreateReceipt | null {
  if (!payload || typeof payload !== "object" || !("ok" in payload) || payload.ok !== true || !("data" in payload)) {
    return null;
  }

  const data = payload.data;
  if (!data || typeof data !== "object") return null;
  const receipt = data as Record<string, unknown>;
  if (
    typeof receipt.id !== "string" ||
    !UUID_PATTERN.test(receipt.id) ||
    receipt.name !== expectedName ||
    typeof receipt.sessionCount !== "number" ||
    !Number.isInteger(receipt.sessionCount) ||
    receipt.sessionCount < 0 ||
    typeof receipt.generatedThrough !== "string" ||
    !isCalendarDate(receipt.generatedThrough)
  ) {
    return null;
  }

  return {
    id: receipt.id,
    name: receipt.name,
    sessionCount: receipt.sessionCount,
    generatedThrough: receipt.generatedThrough,
  };
}
