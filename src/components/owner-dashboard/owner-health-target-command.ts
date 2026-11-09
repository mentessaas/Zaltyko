export const healthScoreTargetKeys = [
  "class_fill_rate",
  "cohort_retention_rate",
  "churn_rate",
  "collection_rate",
  "attendance_coverage",
] as const;

export type HealthScoreTargetKey = (typeof healthScoreTargetKeys)[number];
export type HealthScoreTargets = Record<HealthScoreTargetKey, number>;

export type StoredHealthTargetCommand = {
  organizationId: string;
  key: string;
  body: string;
  targets: HealthScoreTargets;
};

export type HealthTargetCommandRead =
  | { status: "empty" }
  | { status: "pending"; command: StoredHealthTargetCommand }
  | { status: "invalid" | "unavailable" };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_PREFIX = "zaltyko:owner-health-target-command:v1:";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeBody(
  body: string,
  organizationId: string
): HealthScoreTargets | null {
  if (body.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(body);
    if (
      !isRecord(value) ||
      Object.keys(value).sort().join(",") !== "organizationId,targets" ||
      value.organizationId !== organizationId ||
      !isRecord(value.targets) ||
      Object.keys(value.targets).sort().join(",") !==
        [...healthScoreTargetKeys].sort().join(",")
    ) {
      return null;
    }
    const targets = value.targets;
    if (
      !healthScoreTargetKeys.every((key) =>
        typeof targets[key] === "number" &&
        Number.isFinite(targets[key]) &&
        targets[key] >= 0.01 &&
        targets[key] <= 1
      )
    ) {
      return null;
    }
    return Object.fromEntries(
      healthScoreTargetKeys.map((key) => [key, targets[key]])
    ) as HealthScoreTargets;
  } catch {
    return null;
  }
}

function decode(
  raw: string | null,
  organizationId: string
): HealthTargetCommandRead {
  if (raw === null) return { status: "empty" };
  if (raw.length > 8192 || !UUID.test(organizationId)) {
    return { status: "invalid" };
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      Object.keys(value).sort().join(",") !==
        "body,key,organizationId,version" ||
      value.version !== 1 ||
      value.organizationId !== organizationId ||
      typeof value.key !== "string" ||
      !UUID.test(value.key) ||
      typeof value.body !== "string"
    ) {
      return { status: "invalid" };
    }
    const targets = decodeBody(value.body, organizationId);
    if (!targets) return { status: "invalid" };
    return {
      status: "pending",
      command: {
        organizationId,
        key: value.key,
        body: value.body,
        targets,
      },
    };
  } catch {
    return { status: "invalid" };
  }
}

function sameCommand(
  left: StoredHealthTargetCommand,
  right: StoredHealthTargetCommand
) {
  return (
    left.organizationId === right.organizationId &&
    left.key === right.key &&
    left.body === right.body
  );
}

export function healthTargetCommandStorageKey(organizationId: string) {
  return `${STORAGE_PREFIX}${organizationId}`;
}

export function readStoredHealthTargetCommand(
  storage: StorageLike,
  organizationId: string
): HealthTargetCommandRead {
  if (!UUID.test(organizationId)) return { status: "invalid" };
  try {
    return decode(
      storage.getItem(healthTargetCommandStorageKey(organizationId)),
      organizationId
    );
  } catch {
    return { status: "unavailable" };
  }
}

/** Persist before POST; never overwrite a different unresolved command. */
export function persistHealthTargetCommand(
  storage: StorageLike,
  command: StoredHealthTargetCommand
): boolean {
  const current = readStoredHealthTargetCommand(storage, command.organizationId);
  if (current.status === "pending") return sameCommand(current.command, command);
  if (current.status !== "empty") return false;
  const raw = JSON.stringify({
    version: 1,
    organizationId: command.organizationId,
    key: command.key,
    body: command.body,
  });
  try {
    storage.setItem(healthTargetCommandStorageKey(command.organizationId), raw);
    const saved = readStoredHealthTargetCommand(storage, command.organizationId);
    return saved.status === "pending" && sameCommand(saved.command, command);
  } catch {
    return false;
  }
}

/** Clear only the exact resolved command for this academy. */
export function clearStoredHealthTargetCommand(
  storage: StorageLike,
  command: StoredHealthTargetCommand
): boolean {
  const current = readStoredHealthTargetCommand(storage, command.organizationId);
  if (current.status === "empty") return true;
  if (current.status !== "pending" || !sameCommand(current.command, command)) {
    return false;
  }
  try {
    storage.removeItem(healthTargetCommandStorageKey(command.organizationId));
    return readStoredHealthTargetCommand(storage, command.organizationId).status === "empty";
  } catch {
    return false;
  }
}

export function validHealthTargetReceipt(payload: unknown): boolean {
  return (
    isRecord(payload) &&
    Object.keys(payload).sort().join(",") === "profileId,replayed,version" &&
    typeof payload.profileId === "string" &&
    UUID.test(payload.profileId) &&
    typeof payload.version === "number" &&
    Number.isSafeInteger(payload.version) &&
    payload.version >= 1 &&
    typeof payload.replayed === "boolean"
  );
}

export function isCanonicalHealthTargetRejection(
  status: number,
  payload: unknown,
  previouslyUncertain: boolean
): boolean {
  return (
    !previouslyUncertain &&
    status >= 400 &&
    status < 500 &&
    isRecord(payload) &&
    payload.status === status &&
    typeof payload.title === "string" &&
    payload.title.trim().length > 0 &&
    typeof payload.detail === "string" &&
    payload.detail.trim().length > 0 &&
    typeof payload.type === "string" &&
    payload.type.length > 0
  );
}
