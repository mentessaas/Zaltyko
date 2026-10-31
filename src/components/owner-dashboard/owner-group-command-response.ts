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
function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 5000;
}
function date(value: unknown): value is string {
  return typeof value === "string" && value.length === 10 && isSaasTimestamp(`${value}T00:00:00Z`);
}
type ExpectedGroupCreate = {
  locationId: string;
  programId: string;
  name: string;
  capacity: number | null;
};
function expectedGroupCreate(body: string | undefined): ExpectedGroupCreate | null {
  if (typeof body !== "string") return null;
  try {
    const command = JSON.parse(body);
    if (
      !record(command) ||
      !uuid(command.locationId) ||
      !uuid(command.programId) ||
      !text(command.name) ||
      !(command.capacity === null || positiveSafeInteger(command.capacity))
    ) {
      return null;
    }
    return {
      locationId: command.locationId,
      programId: command.programId,
      name: command.name,
      capacity: command.capacity,
    };
  } catch {
    return null;
  }
}

const rejectionStatuses = new Map<string, readonly number[]>(Object.entries({
  "authentication-required": [401], "invalid-group-command": [400],
  "invalid-group-membership-command": [400], "invalid-group-membership-transition": [400, 422],
  forbidden: [403], "location-scope-denied": [403, 404], "not-found": [404],
  "invalid-relation": [409, 422], "version-conflict": [409], "invalid-state-transition": [409],
  "capacity-full": [409], "group-capacity-full": [409], "plan-over-capacity": [409],
  "duplicate-open-group-membership": [409], "invalid-date-range": [409],
}));

export const uncertainGroupCommandMessage = "No sabemos si se guardó. Reintenta la misma operación sin recargar esta página; conservaremos sus datos y su clave para evitar duplicados.";

/** Only receipts and known precondition rejections can release an intent. */
type GroupCommandContext =
  | { kind: "group"; commandBody: string; previouslyUncertain?: boolean }
  | {
      kind: "add" | "create" | "transition";
      groupId?: string;
      athleteId?: string;
      membershipId?: string;
      previouslyUncertain?: boolean;
    };

type GroupCommandOutcome = {
  status: "confirmed" | "rejected" | "uncertain";
  message: string;
  id?: string;
  locationId?: string;
};

export function groupCommandOutcome(
  response: { ok: boolean; status: number },
  payload: unknown,
  context: GroupCommandContext
): GroupCommandOutcome {
  const data = record(payload) && payload.ok === true && record(payload.data) &&
    !["error", "code", "type", "status"].some(field => field in payload) ? payload.data : null;
  if (response.ok && response.status >= 200 && response.status < 300 && data && uuid(data.id)) {
    const expectedGroup = context.kind === "group" ? expectedGroupCreate(context.commandBody) : null;
    if (expectedGroup && text(data.name) && uuid(data.locationId) && uuid(data.programId) &&
        (data.capacity === null || (Number.isSafeInteger(data.capacity) && Number(data.capacity) > 0)) &&
        data.name === expectedGroup.name && data.locationId === expectedGroup.locationId &&
        data.programId === expectedGroup.programId && data.capacity === expectedGroup.capacity) {
      return { status: "confirmed", message: "", id: data.id, locationId: expectedGroup.locationId };
    }
    if (context.kind !== "group" && data.groupId === context.groupId && uuid(data.groupId) &&
        date(data.startsOn) && typeof data.status === "string" && ["pending", "active", "paused", "ended"].includes(data.status) &&
        (context.kind !== "transition" || (data.id === context.membershipId && (data.endsOn === null || date(data.endsOn)))) &&
        (context.kind === "transition" || (uuid(data.athleteId) && (!context.athleteId || data.athleteId === context.athleteId)))) {
      // A replay may return a newer current status; do not require the requested one.
      return { status: "confirmed", message: "", id: data.id };
    }
  }
  // An auth/rate/precondition rejection on a retry cannot establish whether an earlier request committed.
  if (!context.previouslyUncertain && !response.ok && record(payload) && payload.ok === undefined && !("data" in payload)) {
    const type = typeof payload.type === "string" && payload.type.startsWith("https://zaltyko.com/problems/")
      ? payload.type.slice("https://zaltyko.com/problems/".length) : "";
    if (payload.status === response.status && rejectionStatuses.get(type)?.includes(response.status) &&
        payload.error === undefined && payload.code === undefined && text(payload.title) && text(payload.detail)) {
      return { status: "rejected", message: payload.detail };
    }
    if (response.status === 429 && payload.error === "RATE_LIMIT_EXCEEDED" && payload.type === undefined &&
        payload.status === undefined && payload.code === undefined && text(payload.message)) {
      return { status: "rejected", message: payload.message };
    }
  }
  const detail = record(payload) && text(payload.detail) ? `${payload.detail} ` : "";
  return { status: "uncertain", message: `${detail}${uncertainGroupCommandMessage}` };
}
