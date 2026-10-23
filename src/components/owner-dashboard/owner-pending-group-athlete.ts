export type PendingGroupAthleteCreate = Readonly<{
  version: 1;
  organizationId: string;
  groupId: string;
  kind: "create-athlete-and-membership";
  idempotencyKey: string;
}>;

export type GroupAthleteReceipt = Readonly<{
  id: string;
  groupId: string;
  athleteId: string;
  startsOn: string;
  status: "pending" | "active" | "paused" | "ended";
}>;

export type GroupAthleteRecovery =
  | { status: "none" }
  | { status: "complete"; receipt: GroupAthleteReceipt };

const MAX_PENDING_GROUP_ATHLETE_METADATA_LENGTH = 1024;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,150}$/u.test(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function encodePendingGroupAthleteCreate(
  intent: PendingGroupAthleteCreate
): string {
  return JSON.stringify(intent);
}

export function decodePendingGroupAthleteCreate(
  raw: string | null,
  organizationId: string,
  groupId: string
): PendingGroupAthleteCreate | null | false {
  if (raw === null) return null;
  if (raw.length > MAX_PENDING_GROUP_ATHLETE_METADATA_LENGTH) return false;
  let candidate: unknown = raw;
  if (raw.startsWith("{")) {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return false;
    }
  } else if (isIdempotencyKey(raw)) {
    // Previous versions stored only the key. Migrate it without restoring names.
    return {
      version: 1,
      organizationId,
      groupId,
      kind: "create-athlete-and-membership",
      idempotencyKey: raw,
    };
  }
  if (
    !record(candidate) ||
    Object.keys(candidate).sort().join(",") !== "groupId,idempotencyKey,kind,organizationId,version" ||
    candidate.version !== 1 ||
    candidate.organizationId !== organizationId ||
    candidate.groupId !== groupId ||
    candidate.kind !== "create-athlete-and-membership" ||
    !isIdempotencyKey(candidate.idempotencyKey)
  ) {
    return false;
  }
  return candidate as PendingGroupAthleteCreate;
}

export function persistPendingGroupAthleteCreate(
  storage: Storage,
  storageKey: string,
  intent: PendingGroupAthleteCreate
): boolean {
  const encoded = encodePendingGroupAthleteCreate(intent);
  try {
    const existingRaw = storage.getItem(storageKey);
    if (existingRaw !== null) {
      const existing = decodePendingGroupAthleteCreate(
        existingRaw,
        intent.organizationId,
        intent.groupId
      );
      if (!existing || existing === false || existing.idempotencyKey !== intent.idempotencyKey) return false;
    }
    storage.setItem(storageKey, encoded);
    if (storage.getItem(storageKey) !== encoded) return false;
    const decoded = decodePendingGroupAthleteCreate(
      storage.getItem(storageKey),
      intent.organizationId,
      intent.groupId
    );
    return decoded !== null && decoded !== false && decoded.idempotencyKey === intent.idempotencyKey;
  } catch {
    return false;
  }
}

export function clearPendingGroupAthleteCreate(
  storage: Storage,
  storageKey: string,
  intent: PendingGroupAthleteCreate
): boolean {
  try {
    const decoded = decodePendingGroupAthleteCreate(
      storage.getItem(storageKey),
      intent.organizationId,
      intent.groupId
    );
    if (!decoded || decoded === false || decoded.idempotencyKey !== intent.idempotencyKey) return false;
    storage.removeItem(storageKey);
    return storage.getItem(storageKey) === null;
  } catch {
    return false;
  }
}

export function decodeGroupAthleteRecovery(payload: unknown): GroupAthleteRecovery | null {
  if (!record(payload) || payload.ok !== true || !record(payload.data)) return null;
  const data = payload.data;
  if (data.status === "none" && Object.keys(data).sort().join(",") === "status") {
    return { status: "none" };
  }
  if (
    data.status !== "complete" ||
    Object.keys(data).sort().join(",") !== "receipt,status" ||
    !record(data.receipt)
  ) return null;
  const receipt = data.receipt;
  if (
    Object.keys(receipt).sort().join(",") !== "athleteId,groupId,id,startsOn,status" ||
    !isUuid(receipt.id) || !isUuid(receipt.groupId) || !isUuid(receipt.athleteId) ||
    !isIsoDate(receipt.startsOn) ||
    !["pending", "active", "paused", "ended"].includes(String(receipt.status))
  ) return null;
  return { status: "complete", receipt: receipt as GroupAthleteReceipt };
}
