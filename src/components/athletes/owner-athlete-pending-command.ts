export type AthleteLifecycleAction = "bulk-archive" | "restore";

export interface OwnerAthletePendingCommand {
  version: 1;
  academyId: string;
  action: AthleteLifecycleAction;
  athleteIds: string[];
  idempotencyKey: string;
  serializedBody: string;
}

export type PrepareAthleteCommandResult =
  | { status: "ready"; command: OwnerAthletePendingCommand }
  | { status: "pending-conflict" }
  | { status: "unavailable" }
  | { status: "invalid" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,150}$/u;

function storageKey(academyId: string, action: AthleteLifecycleAction) {
  return `owner-athlete-command:v1:${academyId}:${action}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function decode(value: unknown): OwnerAthletePendingCommand | null {
  if (!isRecord(value)) return null;
  const { version, academyId, action, athleteIds, idempotencyKey, serializedBody } = value;
  if (
    version !== 1 ||
    typeof academyId !== "string" ||
    !UUID_PATTERN.test(academyId) ||
    (action !== "bulk-archive" && action !== "restore") ||
    !Array.isArray(athleteIds) ||
    athleteIds.length === 0 ||
    athleteIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id)) ||
    new Set(athleteIds).size !== athleteIds.length ||
    typeof idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey) ||
    typeof serializedBody !== "string" ||
    serializedBody.length > 4096
  ) {
    return null;
  }
  try {
    const body: unknown = JSON.parse(serializedBody);
    if (!isRecord(body) || body.academyId !== academyId) return null;
    if (action === "bulk-archive") {
      if (
        Object.keys(body).sort().join(",") !== "academyId,athleteIds" ||
        !Array.isArray(body.athleteIds) ||
        JSON.stringify(body.athleteIds) !== JSON.stringify(athleteIds)
      ) return null;
    } else if (Object.keys(body).sort().join(",") !== "academyId" || athleteIds.length !== 1) {
      return null;
    }
  } catch {
    return null;
  }
  return { version, academyId, action, athleteIds, idempotencyKey, serializedBody };
}

export function prepareOwnerAthleteCommand(input: {
  academyId: string;
  action: AthleteLifecycleAction;
  athleteIds: string[];
}): PrepareAthleteCommandResult {
  const athleteIds = input.action === "bulk-archive"
    ? [...input.athleteIds].sort()
    : [...input.athleteIds];
  if (
    !UUID_PATTERN.test(input.academyId) ||
    athleteIds.length === 0 ||
    new Set(athleteIds).size !== athleteIds.length ||
    athleteIds.some((id) => !UUID_PATTERN.test(id)) ||
    (input.action === "restore" && athleteIds.length !== 1)
  ) return { status: "invalid" };

  const serializedBody = input.action === "bulk-archive"
    ? JSON.stringify({ academyId: input.academyId, athleteIds })
    : JSON.stringify({ academyId: input.academyId });
  const key = storageKey(input.academyId, input.action);

  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw !== null) {
      if (raw.length > 8192) return { status: "invalid" };
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return { status: "invalid" }; }
      const prior = decode(parsed);
      if (!prior || prior.academyId !== input.academyId || prior.action !== input.action) {
        return { status: "invalid" };
      }
      if (prior.serializedBody !== serializedBody) return { status: "pending-conflict" };
      return { status: "ready", command: prior };
    }

    const idempotencyKey = window.crypto?.randomUUID?.();
    if (!idempotencyKey) return { status: "unavailable" };
    const command = decode({
      version: 1,
      academyId: input.academyId,
      action: input.action,
      athleteIds,
      idempotencyKey,
      serializedBody,
    });
    if (!command) return { status: "invalid" };
    const serializedCommand = JSON.stringify(command);
    window.sessionStorage.setItem(key, serializedCommand);
    if (window.sessionStorage.getItem(key) !== serializedCommand) return { status: "unavailable" };
    return { status: "ready", command };
  } catch {
    return { status: "unavailable" };
  }
}

export function clearOwnerAthleteCommand(command: OwnerAthletePendingCommand): boolean {
  try {
    const key = storageKey(command.academyId, command.action);
    const raw = window.sessionStorage.getItem(key);
    if (!raw || JSON.stringify(decode(JSON.parse(raw))) !== JSON.stringify(command)) return false;
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
