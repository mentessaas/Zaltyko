export type PendingOwnerGroupDetailsUpdate = {
  version: 1;
  organizationId: string;
  groupId: string;
  idempotencyKey: string;
  body: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type PendingState =
  | { status: "none" }
  | { status: "pending"; command: PendingOwnerGroupDetailsUpdate }
  | { status: "invalid" | "unavailable" };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ownerGroupDetailsStorageKey(organizationId: string): string {
  return `zaltyko:pending-group-details-update:v1:${organizationId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidBody(value: unknown, organizationId: string): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  if (
    keys.some((key) => !["organizationId", "expectedUpdatedAt", "name", "capacity"].includes(key)) ||
    !keys.includes("organizationId") ||
    !keys.includes("expectedUpdatedAt") ||
    value.organizationId !== organizationId ||
    typeof value.expectedUpdatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.expectedUpdatedAt))
  ) {
    return false;
  }
  if (
    value.name !== undefined &&
    (typeof value.name !== "string" || value.name.trim().length < 2 || value.name.trim().length > 120)
  ) {
    return false;
  }
  if (
    value.capacity !== undefined &&
    value.capacity !== null &&
    (typeof value.capacity !== "number" ||
      !Number.isInteger(value.capacity) ||
      value.capacity < 1 ||
      value.capacity > 5000)
  ) {
    return false;
  }
  return value.name !== undefined || value.capacity !== undefined;
}

function decode(value: unknown, organizationId: string): PendingOwnerGroupDetailsUpdate | null {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !==
      "body,groupId,idempotencyKey,organizationId,version" ||
    value.version !== 1 ||
    value.organizationId !== organizationId ||
    typeof value.groupId !== "string" ||
    !UUID.test(value.groupId) ||
    typeof value.idempotencyKey !== "string" ||
    value.idempotencyKey.length < 8 ||
    value.idempotencyKey.length > 180 ||
    typeof value.body !== "string" ||
    value.body.length > 4096
  ) {
    return null;
  }
  try {
    if (!isValidBody(JSON.parse(value.body), organizationId)) return null;
  } catch {
    return null;
  }
  return value as PendingOwnerGroupDetailsUpdate;
}

export function readPendingOwnerGroupDetailsUpdate(
  storage: StorageLike,
  organizationId: string
): PendingState {
  if (!UUID.test(organizationId)) return { status: "invalid" };
  let raw: string | null;
  try {
    raw = storage.getItem(ownerGroupDetailsStorageKey(organizationId));
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "none" };
  if (raw.length > 8192) return { status: "invalid" };
  try {
    const command = decode(JSON.parse(raw), organizationId);
    return command ? { status: "pending", command } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

export function persistPendingOwnerGroupDetailsUpdate(
  storage: StorageLike,
  command: PendingOwnerGroupDetailsUpdate
): boolean {
  const decoded = decode(command, command.organizationId);
  if (!decoded) return false;
  const key = ownerGroupDetailsStorageKey(command.organizationId);
  const current = readPendingOwnerGroupDetailsUpdate(storage, command.organizationId);
  if (current.status === "pending") {
    return JSON.stringify(current.command) === JSON.stringify(command);
  }
  if (current.status !== "none") return false;
  try {
    storage.setItem(key, JSON.stringify(command));
    const saved = readPendingOwnerGroupDetailsUpdate(storage, command.organizationId);
    return saved.status === "pending" && JSON.stringify(saved.command) === JSON.stringify(command);
  } catch {
    return false;
  }
}

export function clearPendingOwnerGroupDetailsUpdate(
  storage: StorageLike,
  command: PendingOwnerGroupDetailsUpdate
): boolean {
  const key = ownerGroupDetailsStorageKey(command.organizationId);
  const current = readPendingOwnerGroupDetailsUpdate(storage, command.organizationId);
  if (current.status === "none") return true;
  if (
    current.status !== "pending" ||
    JSON.stringify(current.command) !== JSON.stringify(command)
  ) {
    return false;
  }
  try {
    storage.removeItem(key);
    return readPendingOwnerGroupDetailsUpdate(storage, command.organizationId).status === "none";
  } catch {
    return false;
  }
}
