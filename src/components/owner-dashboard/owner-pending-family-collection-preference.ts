export type FamilyCollectionMode = "manual" | "automatic";

export type FamilyCollectionPreferenceSnapshot = {
  version: 1;
  organizationId: string;
  familyId: string;
  mode: FamilyCollectionMode;
  expectedVersion: number;
  idempotencyKey: string;
};

export type FamilyCollectionPreferenceCommand = {
  organizationId: string;
  familyId: string;
  mode: FamilyCollectionMode;
  expectedVersion: number;
  key: string;
  body: string;
};

export const PENDING_FAMILY_COLLECTION_PREFERENCE_STORAGE_KEY =
  "zaltyko:pending-family-collection-preference:v1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PREFIX = "family-preference-";
const STORAGE_KEYS =
  "expectedVersion,familyId,idempotencyKey,mode,organizationId,version";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(IDEMPOTENCY_PREFIX) &&
    UUID.test(value.slice(IDEMPOTENCY_PREFIX.length))
  );
}

function parseSnapshot(value: unknown): FamilyCollectionPreferenceSnapshot | null {
  if (
    !record(value) ||
    Object.keys(value).sort().join(",") !== STORAGE_KEYS ||
    value.version !== 1 ||
    typeof value.organizationId !== "string" ||
    !UUID.test(value.organizationId) ||
    typeof value.familyId !== "string" ||
    !UUID.test(value.familyId) ||
    (value.mode !== "manual" && value.mode !== "automatic") ||
    !Number.isSafeInteger(value.expectedVersion) ||
    Number(value.expectedVersion) < 0 ||
    !isIdempotencyKey(value.idempotencyKey)
  ) {
    return null;
  }
  return value as FamilyCollectionPreferenceSnapshot;
}

export function snapshotFromFamilyCollectionCommand(
  command: FamilyCollectionPreferenceCommand
): FamilyCollectionPreferenceSnapshot | null {
  let body: unknown;
  try {
    body = JSON.parse(command.body);
  } catch {
    return null;
  }
  if (
    !record(body) ||
    Object.keys(body).sort().join(",") !==
      "expectedVersion,familyId,mode,organizationId" ||
    !UUID.test(command.organizationId) ||
    !UUID.test(command.familyId) ||
    body.organizationId !== command.organizationId ||
    body.familyId !== command.familyId ||
    body.mode !== command.mode ||
    body.expectedVersion !== command.expectedVersion ||
    !Number.isSafeInteger(command.expectedVersion) ||
    command.expectedVersion < 0 ||
    !isIdempotencyKey(command.key)
  ) {
    return null;
  }
  return {
    version: 1,
    organizationId: command.organizationId,
    familyId: command.familyId,
    mode: command.mode,
    expectedVersion: command.expectedVersion,
    idempotencyKey: command.key,
  };
}

export function familyCollectionCommandFromSnapshot(
  snapshot: FamilyCollectionPreferenceSnapshot
): FamilyCollectionPreferenceCommand {
  return {
    organizationId: snapshot.organizationId,
    familyId: snapshot.familyId,
    mode: snapshot.mode,
    expectedVersion: snapshot.expectedVersion,
    key: snapshot.idempotencyKey,
    body: JSON.stringify({
      organizationId: snapshot.organizationId,
      familyId: snapshot.familyId,
      mode: snapshot.mode,
      expectedVersion: snapshot.expectedVersion,
    }),
  };
}

export function readPendingFamilyCollectionPreference(storage: StorageLike):
  | { status: "none" }
  | { status: "pending"; snapshot: FamilyCollectionPreferenceSnapshot }
  | { status: "invalid" | "unavailable" } {
  try {
    const raw = storage.getItem(PENDING_FAMILY_COLLECTION_PREFERENCE_STORAGE_KEY);
    if (raw === null) return { status: "none" };
    if (raw.length > 2048) return { status: "invalid" };
    const snapshot = parseSnapshot(JSON.parse(raw) as unknown);
    return snapshot ? { status: "pending", snapshot } : { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }
}

export function persistPendingFamilyCollectionPreference(
  storage: StorageLike,
  command: FamilyCollectionPreferenceCommand
): boolean {
  const snapshot = snapshotFromFamilyCollectionCommand(command);
  if (!snapshot) return false;
  const current = readPendingFamilyCollectionPreference(storage);
  if (current.status === "pending") {
    return JSON.stringify(current.snapshot) === JSON.stringify(snapshot);
  }
  if (current.status !== "none") return false;
  try {
    storage.setItem(
      PENDING_FAMILY_COLLECTION_PREFERENCE_STORAGE_KEY,
      JSON.stringify(snapshot)
    );
    const saved = readPendingFamilyCollectionPreference(storage);
    return (
      saved.status === "pending" &&
      JSON.stringify(saved.snapshot) === JSON.stringify(snapshot)
    );
  } catch {
    return false;
  }
}

export function clearPendingFamilyCollectionPreference(
  storage: StorageLike,
  command: FamilyCollectionPreferenceCommand
): boolean {
  const snapshot = snapshotFromFamilyCollectionCommand(command);
  if (!snapshot) return false;
  const current = readPendingFamilyCollectionPreference(storage);
  if (current.status === "none") return true;
  if (
    current.status !== "pending" ||
    JSON.stringify(current.snapshot) !== JSON.stringify(snapshot)
  ) {
    return false;
  }
  try {
    storage.removeItem(PENDING_FAMILY_COLLECTION_PREFERENCE_STORAGE_KEY);
    return readPendingFamilyCollectionPreference(storage).status === "none";
  } catch {
    return false;
  }
}
