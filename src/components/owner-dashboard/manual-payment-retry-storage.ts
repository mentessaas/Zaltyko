export type ManualPaymentMethod =
  | "cash"
  | "bank_transfer"
  | "card_terminal"
  | "other";

export type ManualPaymentRetrySnapshot = Readonly<{
  version: 2;
  actorScopeHash: string;
  organizationId: string;
  chargeId: string;
  amountCents: number;
  expectedOutstandingCents: number | null;
  method: ManualPaymentMethod;
  currency: string;
  receivedAt: string;
  idempotencyKey: string;
  referenceSha256: string | null;
}>;

export type ManualPaymentRetryBody = Readonly<{
  organizationId: string;
  chargeId: string;
  amountCents: number;
  method: ManualPaymentMethod;
  receivedAt: string;
  reference?: string;
}>;

export type ManualPaymentRetryStorageLike = Pick<
  Storage,
  "length" | "key" | "getItem" | "setItem" | "removeItem"
>;

export const PENDING_MANUAL_PAYMENT_STORAGE_PREFIX =
  "zaltyko:pending-manual-payment:v2:";
export const LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY =
  "zaltyko:pending-manual-payment:v1";
export const RESOLVED_MANUAL_PAYMENT_STORAGE_PREFIX =
  "zaltyko:resolved-manual-payment:v2:";
export const MANUAL_PAYMENT_RETRY_LOCK_NAME =
  "zaltyko:owner-manual-payment:lock:v2";

type ManualPaymentRetryStorageResult<T> =
  | { status: "none" }
  | { status: "pending"; snapshots: T[] }
  | { status: "invalid" | "unavailable" };

type LegacyManualPaymentRetrySnapshot = Readonly<{
  version: 1;
  organizationId: string;
  chargeId: string;
  amountCents: number;
  method: ManualPaymentMethod;
  currency: string;
  receivedAt: string;
  idempotencyKey: string;
  referenceSha256: string | null;
}>;

export type ResolvedManualPaymentMarker = Readonly<{
  version: 1;
  organizationId: string;
  chargeId: string;
  remainingCents: number | null;
}>;

const SNAPSHOT_KEYS =
  "actorScopeHash,amountCents,chargeId,currency,expectedOutstandingCents,idempotencyKey,method,organizationId,receivedAt,referenceSha256,version";
const LEGACY_SNAPSHOT_KEYS =
  "amountCents,chargeId,currency,idempotencyKey,method,organizationId,receivedAt,referenceSha256,version";
const MARKER_KEYS = "chargeId,organizationId,remainingCents,version";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/u;
const KEY = /^owner-manual-payment:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const METHODS = new Set<ManualPaymentMethod>([
  "cash",
  "bank_transfer",
  "card_terminal",
  "other",
]);
const CURRENCY = /^[A-Z]{3}$/u;
const MAX_SNAPSHOT_LENGTH = 2048;
const MAX_STORAGE_ENTRIES = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSnapshot(value: unknown): ManualPaymentRetrySnapshot | null {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== SNAPSHOT_KEYS ||
    value.version !== 2 ||
    typeof value.actorScopeHash !== "string" ||
    !HASH.test(value.actorScopeHash) ||
    typeof value.organizationId !== "string" ||
    !UUID.test(value.organizationId) ||
    typeof value.chargeId !== "string" ||
    !UUID.test(value.chargeId) ||
    !Number.isSafeInteger(value.amountCents) ||
    Number(value.amountCents) <= 0 ||
    (value.expectedOutstandingCents !== null &&
      (!Number.isSafeInteger(value.expectedOutstandingCents) ||
        Number(value.expectedOutstandingCents) <= 0 ||
        Number(value.amountCents) > Number(value.expectedOutstandingCents))) ||
    typeof value.method !== "string" ||
    !METHODS.has(value.method as ManualPaymentMethod) ||
    typeof value.currency !== "string" ||
    !CURRENCY.test(value.currency) ||
    typeof value.receivedAt !== "string" ||
    !Number.isFinite(Date.parse(value.receivedAt)) ||
    typeof value.idempotencyKey !== "string" ||
    !KEY.test(value.idempotencyKey) ||
    (value.referenceSha256 !== null &&
      (typeof value.referenceSha256 !== "string" ||
        !HASH.test(value.referenceSha256)))
  ) {
    return null;
  }
  return value as ManualPaymentRetrySnapshot;
}

function parseLegacySnapshot(
  value: unknown
): LegacyManualPaymentRetrySnapshot | null {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== LEGACY_SNAPSHOT_KEYS ||
    value.version !== 1 ||
    typeof value.organizationId !== "string" ||
    !UUID.test(value.organizationId) ||
    typeof value.chargeId !== "string" ||
    !UUID.test(value.chargeId) ||
    !Number.isSafeInteger(value.amountCents) ||
    Number(value.amountCents) <= 0 ||
    typeof value.method !== "string" ||
    !METHODS.has(value.method as ManualPaymentMethod) ||
    typeof value.currency !== "string" ||
    !CURRENCY.test(value.currency) ||
    typeof value.receivedAt !== "string" ||
    !Number.isFinite(Date.parse(value.receivedAt)) ||
    typeof value.idempotencyKey !== "string" ||
    !KEY.test(value.idempotencyKey) ||
    (value.referenceSha256 !== null &&
      (typeof value.referenceSha256 !== "string" ||
        !HASH.test(value.referenceSha256)))
  ) {
    return null;
  }
  return value as LegacyManualPaymentRetrySnapshot;
}

function parseMarker(value: unknown): ResolvedManualPaymentMarker | null {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== MARKER_KEYS ||
    value.version !== 1 ||
    typeof value.organizationId !== "string" ||
    !UUID.test(value.organizationId) ||
    typeof value.chargeId !== "string" ||
    !UUID.test(value.chargeId) ||
    (value.remainingCents !== null &&
      (!Number.isSafeInteger(value.remainingCents) ||
        Number(value.remainingCents) < 0))
  ) {
    return null;
  }
  return value as ResolvedManualPaymentMarker;
}

function pendingStorageKey(
  actorScopeHash: string,
  organizationId: string,
  chargeId: string
): string {
  return `${PENDING_MANUAL_PAYMENT_STORAGE_PREFIX}${actorScopeHash}:${organizationId}:${chargeId}`;
}

function resolvedStorageKey(
  organizationId: string,
  chargeId: string
): string {
  return `${RESOLVED_MANUAL_PAYMENT_STORAGE_PREFIX}${organizationId}:${chargeId}`;
}

function sameSnapshot(
  left: ManualPaymentRetrySnapshot,
  right: ManualPaymentRetrySnapshot
): boolean {
  return (
    left.version === right.version &&
    left.actorScopeHash === right.actorScopeHash &&
    left.organizationId === right.organizationId &&
    left.chargeId === right.chargeId &&
    left.amountCents === right.amountCents &&
    left.expectedOutstandingCents === right.expectedOutstandingCents &&
    left.method === right.method &&
    left.currency === right.currency &&
    left.receivedAt === right.receivedAt &&
    left.idempotencyKey === right.idempotencyKey &&
    left.referenceSha256 === right.referenceSha256
  );
}

export async function withManualPaymentRetryLock<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    const locks = (
      globalThis.navigator as Navigator & {
        locks?: {
          request<R>(
            name: string,
            options: { mode: "exclusive" },
            callback: () => Promise<R>
          ): Promise<R>;
        };
      }
    )?.locks;
    if (!locks || typeof locks.request !== "function") {
      throw new Error("La coordinación entre pestañas no está disponible.");
    }
    return await locks.request(
      MANUAL_PAYMENT_RETRY_LOCK_NAME,
      { mode: "exclusive" },
      operation
    );
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("No se pudo coordinar el reintento entre pestañas.");
  }
}

export async function fingerprintManualPaymentReference(
  reference: string | undefined
): Promise<string | null> {
  const normalized = reference?.trim() ?? "";
  if (!normalized) return null;
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    throw new Error("No se puede verificar de forma segura la referencia del pago.");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function fingerprintManualPaymentActor(
  actorId: string
): Promise<string> {
  if (!UUID.test(actorId)) {
    throw new Error("No se pudo identificar la sesión propietaria del registro.");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(actorId)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function createManualPaymentRetrySnapshot(args: {
  body: ManualPaymentRetryBody;
  currency: string;
  expectedOutstandingCents: number;
  actorScopeHash: string;
  idempotencyKey: string;
}): Promise<ManualPaymentRetrySnapshot | null> {
  if (
    !CURRENCY.test(args.currency) ||
    !Number.isSafeInteger(args.expectedOutstandingCents) ||
    args.expectedOutstandingCents <= 0 ||
    args.body.amountCents > args.expectedOutstandingCents
  ) {
    return null;
  }
  const referenceSha256 = await fingerprintManualPaymentReference(
    args.body.reference
  );
  return parseSnapshot({
    version: 2,
    actorScopeHash: args.actorScopeHash,
    organizationId: args.body.organizationId,
    chargeId: args.body.chargeId,
    amountCents: args.body.amountCents,
    expectedOutstandingCents: args.expectedOutstandingCents,
    method: args.body.method,
    currency: args.currency,
    receivedAt: args.body.receivedAt,
    idempotencyKey: args.idempotencyKey,
    referenceSha256,
  });
}

export async function restoreManualPaymentRetryBody(
  snapshot: ManualPaymentRetrySnapshot,
  referenceInput: string
): Promise<
  | { status: "ready"; body: ManualPaymentRetryBody }
  | { status: "reference-required" }
  | { status: "reference-mismatch" }
> {
  const reference = referenceInput.trim();
  if (snapshot.referenceSha256 === null && reference) {
    return { status: "reference-mismatch" };
  }
  if (snapshot.referenceSha256 !== null) {
    if (!reference) return { status: "reference-required" };
    if (
      (await fingerprintManualPaymentReference(reference)) !==
      snapshot.referenceSha256
    ) {
      return { status: "reference-mismatch" };
    }
  }
  return {
    status: "ready",
    body: {
      organizationId: snapshot.organizationId,
      chargeId: snapshot.chargeId,
      amountCents: snapshot.amountCents,
      method: snapshot.method,
      ...(snapshot.referenceSha256 !== null ? { reference } : {}),
      receivedAt: snapshot.receivedAt,
    },
  };
}

function decodeJson(raw: string): unknown | null {
  if (raw.length > MAX_SNAPSHOT_LENGTH) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function readPendingManualPayments(
  storage: ManualPaymentRetryStorageLike,
  actorScopeHash: string
): ManualPaymentRetryStorageResult<ManualPaymentRetrySnapshot> {
  if (!HASH.test(actorScopeHash)) return { status: "invalid" };
  const all = readAllPendingManualPayments(storage);
  if (all.status !== "pending") return all;
  const snapshots = all.snapshots.filter(
    (snapshot) => snapshot.actorScopeHash === actorScopeHash
  );
  return snapshots.length > 0
    ? { status: "pending", snapshots }
    : { status: "none" };
}

export function readAllPendingManualPayments(
  storage: ManualPaymentRetryStorageLike
): ManualPaymentRetryStorageResult<ManualPaymentRetrySnapshot> {
  try {
    const storageLength = storage.length;
    if (!Number.isSafeInteger(storageLength) || storageLength < 0) {
      return { status: "invalid" };
    }
    const keys: string[] = [];
    for (let index = 0; index < storageLength; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(PENDING_MANUAL_PAYMENT_STORAGE_PREFIX)) {
        keys.push(key);
        if (keys.length > MAX_STORAGE_ENTRIES) return { status: "invalid" };
      }
    }
    const snapshots: ManualPaymentRetrySnapshot[] = [];
    for (const key of keys) {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const snapshot = parseSnapshot(decodeJson(raw));
      if (
        !snapshot ||
        key !==
          pendingStorageKey(
            snapshot.actorScopeHash,
            snapshot.organizationId,
            snapshot.chargeId
          )
      ) {
        return { status: "invalid" };
      }
      snapshots.push(snapshot);
    }
    snapshots.sort((left, right) =>
      left.receivedAt.localeCompare(right.receivedAt)
    );
    return snapshots.length > 0
      ? { status: "pending", snapshots }
      : { status: "none" };
  } catch {
    return { status: "unavailable" };
  }
}

export function readResolvedManualPaymentMarker(
  storage: ManualPaymentRetryStorageLike,
  organizationId: string,
  chargeId: string
):
  | { status: "marker"; marker: ResolvedManualPaymentMarker }
  | { status: "none" | "invalid" | "unavailable" } {
  try {
    const raw = storage.getItem(
      resolvedStorageKey(organizationId, chargeId)
    );
    if (raw === null) return { status: "none" };
    const marker = parseMarker(decodeJson(raw));
    return marker &&
      marker.organizationId === organizationId &&
      marker.chargeId === chargeId
      ? { status: "marker", marker }
      : { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }
}

export function persistPendingManualPayment(
  storage: ManualPaymentRetryStorageLike,
  snapshot: ManualPaymentRetrySnapshot
): boolean {
  const normalized = parseSnapshot(snapshot);
  if (!normalized) return false;
  const key = pendingStorageKey(
    normalized.actorScopeHash,
    normalized.organizationId,
    normalized.chargeId
  );
  try {
    const currentRaw = storage.getItem(key);
    if (currentRaw !== null) {
      const current = parseSnapshot(decodeJson(currentRaw));
      return current !== null && sameSnapshot(current, normalized);
    }
    const encoded = JSON.stringify(normalized);
    storage.setItem(key, encoded);
    const saved = storage.getItem(key);
    const verified = saved === null ? null : parseSnapshot(decodeJson(saved));
    return verified !== null && sameSnapshot(verified, normalized);
  } catch {
    return false;
  }
}

export function clearPendingManualPayment(
  storage: ManualPaymentRetryStorageLike,
  snapshot: ManualPaymentRetrySnapshot
): boolean {
  const key = pendingStorageKey(
    snapshot.actorScopeHash,
    snapshot.organizationId,
    snapshot.chargeId
  );
  try {
    const currentRaw = storage.getItem(key);
    if (currentRaw === null) return true;
    const current = parseSnapshot(decodeJson(currentRaw));
    if (current === null || !sameSnapshot(current, snapshot)) return false;
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

export function persistResolvedManualPaymentMarker(
  storage: ManualPaymentRetryStorageLike,
  snapshot: ManualPaymentRetrySnapshot
): boolean {
  return persistManualPaymentBalanceMarker(
    storage,
    snapshot.organizationId,
    snapshot.chargeId,
    snapshot.expectedOutstandingCents === null
      ? null
      : snapshot.expectedOutstandingCents - snapshot.amountCents
  );
}

export function persistManualPaymentBalanceMarker(
  storage: ManualPaymentRetryStorageLike,
  organizationId: string,
  chargeId: string,
  remainingCents: number | null
): boolean {
  const marker: ResolvedManualPaymentMarker = {
    version: 1,
    organizationId,
    chargeId,
    remainingCents,
  };
  const key = resolvedStorageKey(organizationId, chargeId);
  try {
    const encoded = JSON.stringify(marker);
    storage.setItem(key, encoded);
    const saved = storage.getItem(key);
    const verified = saved === null ? null : parseMarker(decodeJson(saved));
    return (
      verified !== null &&
      verified.organizationId === marker.organizationId &&
      verified.chargeId === marker.chargeId &&
      verified.remainingCents === marker.remainingCents
    );
  } catch {
    return false;
  }
}

export function migrateLegacyPendingManualPayment(
  legacyStorage: ManualPaymentRetryStorageLike,
  durableStorage: ManualPaymentRetryStorageLike,
  actorScopeHash: string
): "none" | "migrated" | "invalid" | "unavailable" {
  try {
    const raw = legacyStorage.getItem(
      LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY
    );
    if (raw === null) return "none";
    const legacy = parseLegacySnapshot(decodeJson(raw));
    if (!legacy) return "invalid";
    const snapshot = parseSnapshot({
      ...legacy,
      actorScopeHash,
      version: 2,
      expectedOutstandingCents: null,
    });
    if (!snapshot) return "invalid";
    const existing = readAllPendingManualPayments(durableStorage);
    if (existing.status === "invalid" || existing.status === "unavailable") {
      return "unavailable";
    }
    if (
      existing.status === "pending" &&
      !existing.snapshots.some((entry) => sameSnapshot(entry, snapshot))
    ) {
      return "unavailable";
    }
    if (!persistPendingManualPayment(durableStorage, snapshot)) {
      return "unavailable";
    }
    const verified = readPendingManualPayments(durableStorage, actorScopeHash);
    if (
      verified.status !== "pending" ||
      !verified.snapshots.some((entry) => sameSnapshot(entry, snapshot))
    ) {
      return verified.status === "invalid" ? "invalid" : "unavailable";
    }
    if (
      legacyStorage.getItem(LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY) !== raw
    ) {
      return "unavailable";
    }
    legacyStorage.removeItem(LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY);
    return legacyStorage.getItem(LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY) ===
      null
      ? "migrated"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}
