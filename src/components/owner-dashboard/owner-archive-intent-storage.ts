import type { UsageResource } from "./owner-plan-usage-response";

const STORAGE_KEY = "zaltyko:owner-plan-archive-intent:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMAND_KEY = /^archive-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Stores only the opaque IDs needed to replay; never names or profile fields. */
export type StoredArchiveIntent = {
  organizationId: string;
  resource: UsageResource;
  resourceId: string;
  key: string;
};

type ArchiveIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ArchiveIntentRead =
  | { status: "empty" }
  | { status: "pending"; intent: StoredArchiveIntent }
  | { status: "invalid" }
  | { status: "unavailable" };

function isResource(value: unknown): value is UsageResource {
  return value === "athletes" || value === "groups" || value === "classes";
}

function decode(raw: string | null): ArchiveIntentRead {
  if (raw === null) return { status: "empty" };
  if (raw.length > 1024) return { status: "invalid" };
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { status: "invalid" };
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "key,organizationId,resource,resourceId,version" ||
        record.version !== 1 || typeof record.organizationId !== "string" || !UUID.test(record.organizationId) ||
        !isResource(record.resource) || typeof record.resourceId !== "string" || !UUID.test(record.resourceId) ||
        typeof record.key !== "string" || !COMMAND_KEY.test(record.key)) return { status: "invalid" };
    return {
      status: "pending",
      intent: { organizationId: record.organizationId, resource: record.resource, resourceId: record.resourceId, key: record.key },
    };
  } catch {
    return { status: "invalid" };
  }
}

function sameIntent(left: StoredArchiveIntent, right: StoredArchiveIntent): boolean {
  return left.organizationId === right.organizationId && left.resource === right.resource &&
    left.resourceId === right.resourceId && left.key === right.key;
}

export function readStoredArchiveIntent(storage: ArchiveIntentStorage): ArchiveIntentRead {
  try { return decode(storage.getItem(STORAGE_KEY)); }
  catch { return { status: "unavailable" }; }
}

/** Refuses to overwrite any unresolved intent; caller must persist before sending the request. */
export function persistArchiveIntent(storage: ArchiveIntentStorage, intent: StoredArchiveIntent): boolean {
  const current = readStoredArchiveIntent(storage);
  if (current.status === "pending") return sameIntent(current.intent, intent);
  if (current.status !== "empty") return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...intent }));
    const saved = readStoredArchiveIntent(storage);
    return saved.status === "pending" && sameIntent(saved.intent, intent);
  } catch {
    return false;
  }
}

/** Clears only the exact resolved command, never a different academy or resource. */
export function clearStoredArchiveIntent(storage: ArchiveIntentStorage, intent: StoredArchiveIntent): boolean {
  const current = readStoredArchiveIntent(storage);
  if (current.status === "empty") return true;
  if (current.status !== "pending" || !sameIntent(current.intent, intent)) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return readStoredArchiveIntent(storage).status === "empty";
  } catch {
    return false;
  }
}
