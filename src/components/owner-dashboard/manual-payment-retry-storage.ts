export type ManualPaymentMethod =
  | "cash"
  | "bank_transfer"
  | "card_terminal"
  | "other";

export type ManualPaymentRetrySnapshot = Readonly<{
  version: 2;
  actorUserId: string;
  organizationId: string;
  chargeId: string;
  amountCents: number;
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

const PENDING_MANUAL_PAYMENT_STORAGE_PREFIX =
  "zaltyko:pending-manual-payment:v2";
const LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY =
  "zaltyko:pending-manual-payment:v1";

const SNAPSHOT_KEYS_V1 =
  "amountCents,chargeId,currency,idempotencyKey,method,organizationId,receivedAt,referenceSha256,version";
const SNAPSHOT_KEYS_V2 =
  "actorUserId,amountCents,chargeId,currency,idempotencyKey,method,organizationId,receivedAt,referenceSha256,version";
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

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSnapshot(value: unknown): ManualPaymentRetrySnapshot | null {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== SNAPSHOT_KEYS_V2 ||
    value.version !== 2 ||
    typeof value.actorUserId !== "string" ||
    !UUID.test(value.actorUserId) ||
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
  return value as ManualPaymentRetrySnapshot;
}

type LegacyManualPaymentRetrySnapshot = Omit<
  ManualPaymentRetrySnapshot,
  "version" | "actorUserId"
> & { version: 1 };

function parseLegacySnapshot(
  value: unknown
): LegacyManualPaymentRetrySnapshot | null {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== SNAPSHOT_KEYS_V1 ||
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

function sameSnapshot(
  left: ManualPaymentRetrySnapshot,
  right: ManualPaymentRetrySnapshot
): boolean {
  return (
    left.version === right.version &&
    left.actorUserId === right.actorUserId &&
    left.organizationId === right.organizationId &&
    left.chargeId === right.chargeId &&
    left.amountCents === right.amountCents &&
    left.method === right.method &&
    left.currency === right.currency &&
    left.receivedAt === right.receivedAt &&
    left.idempotencyKey === right.idempotencyKey &&
    left.referenceSha256 === right.referenceSha256
  );
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

export async function createManualPaymentRetrySnapshot(args: {
  actorUserId: string;
  body: ManualPaymentRetryBody;
  currency: string;
  idempotencyKey: string;
}): Promise<ManualPaymentRetrySnapshot | null> {
  if (!CURRENCY.test(args.currency)) return null;
  if (!UUID.test(args.actorUserId)) return null;
  const referenceSha256 = await fingerprintManualPaymentReference(
    args.body.reference
  );
  return parseSnapshot({
    version: 2,
    actorUserId: args.actorUserId,
    organizationId: args.body.organizationId,
    chargeId: args.body.chargeId,
    amountCents: args.body.amountCents,
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

export function pendingManualPaymentStorageKey(
  actorUserId: string
): string | null {
  if (!UUID.test(actorUserId)) return null;
  return `${PENDING_MANUAL_PAYMENT_STORAGE_PREFIX}:${actorUserId}`;
}

export function readPendingManualPayment(
  storage: StorageLike,
  actorUserId: string,
  legacyStorage?: StorageLike
):
  | { status: "none" }
  | { status: "pending"; snapshot: ManualPaymentRetrySnapshot }
  | { status: "legacy-pending" }
  | { status: "invalid" | "unavailable" } {
  const storageKey = pendingManualPaymentStorageKey(actorUserId);
  if (!storageKey) return { status: "invalid" };

  let raw: string | null;
  try {
    raw = storage.getItem(storageKey);
  } catch {
    return { status: "unavailable" };
  }
  if (raw !== null) {
    if (raw.length > MAX_SNAPSHOT_LENGTH) return { status: "invalid" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: "invalid" };
    }
    const snapshot = parseSnapshot(parsed);
    return snapshot && snapshot.actorUserId === actorUserId
      ? { status: "pending", snapshot }
      : { status: "invalid" };
  }

  if (!legacyStorage) return { status: "none" };
  let legacyRaw: string | null;
  try {
    legacyRaw = legacyStorage.getItem(
      LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY
    );
  } catch {
    return { status: "unavailable" };
  }
  if (legacyRaw === null) return { status: "none" };
  if (legacyRaw.length > MAX_SNAPSHOT_LENGTH) return { status: "invalid" };

  let legacyValue: unknown;
  try {
    legacyValue = JSON.parse(legacyRaw);
  } catch {
    return { status: "invalid" };
  }
  const legacySnapshot = parseLegacySnapshot(legacyValue);
  if (!legacySnapshot) return { status: "invalid" };
  return { status: "legacy-pending" };
}

/**
 * Claims an unbound v1 retry only after the current user explicitly confirms
 * it. The old format has no actor ID, so reading it must never silently bind
 * it to whichever account happens to be signed in.
 */
export function migrateLegacyPendingManualPayment(
  storage: StorageLike,
  legacyStorage: StorageLike,
  actorUserId: string
):
  | { status: "pending"; snapshot: ManualPaymentRetrySnapshot }
  | { status: "none" | "invalid" | "unavailable" } {
  const storageKey = pendingManualPaymentStorageKey(actorUserId);
  if (!storageKey) return { status: "invalid" };

  let legacyRaw: string | null;
  try {
    legacyRaw = legacyStorage.getItem(
      LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY
    );
  } catch {
    return { status: "unavailable" };
  }
  if (legacyRaw === null) return { status: "none" };
  if (legacyRaw.length > MAX_SNAPSHOT_LENGTH) return { status: "invalid" };

  let legacyValue: unknown;
  try {
    legacyValue = JSON.parse(legacyRaw);
  } catch {
    return { status: "invalid" };
  }
  const legacySnapshot = parseLegacySnapshot(legacyValue);
  if (!legacySnapshot) return { status: "invalid" };

  const existing = readPendingManualPayment(storage, actorUserId);
  if (existing.status !== "none") return { status: "unavailable" };

  const migrated = parseSnapshot({
    ...legacySnapshot,
    version: 2,
    actorUserId,
  });
  if (!migrated) return { status: "invalid" };
  const encoded = JSON.stringify(migrated);
  try {
    storage.setItem(storageKey, encoded);
    if (storage.getItem(storageKey) !== encoded) {
      return { status: "unavailable" };
    }
    if (
      legacyStorage.getItem(LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY) !==
      legacyRaw
    ) {
      return { status: "unavailable" };
    }
    legacyStorage.removeItem(LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY);
    if (
      legacyStorage.getItem(LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY) !== null
    ) {
      return { status: "unavailable" };
    }
    return { status: "pending", snapshot: migrated };
  } catch {
    // Keep the new copy if the two storage operations cannot be reconciled.
    // A later read still blocks on this actor-specific pending command.
    return { status: "unavailable" };
  }
}

export function persistPendingManualPayment(
  storage: StorageLike,
  snapshot: ManualPaymentRetrySnapshot
): boolean {
  const normalized = parseSnapshot(snapshot);
  const storageKey = pendingManualPaymentStorageKey(snapshot.actorUserId);
  if (!normalized || !storageKey) return false;
  const current = readPendingManualPayment(storage, snapshot.actorUserId);
  if (current.status === "pending") {
    return sameSnapshot(current.snapshot, normalized);
  }
  if (current.status !== "none") return false;
  try {
    const encoded = JSON.stringify(normalized);
    storage.setItem(storageKey, encoded);
    const saved = readPendingManualPayment(storage, snapshot.actorUserId);
    return (
      saved.status === "pending" &&
      JSON.stringify(saved.snapshot) === encoded
    );
  } catch {
    return false;
  }
}

export function clearPendingManualPayment(
  storage: StorageLike,
  snapshot: ManualPaymentRetrySnapshot
): boolean {
  const storageKey = pendingManualPaymentStorageKey(snapshot.actorUserId);
  if (!storageKey) return false;
  const current = readPendingManualPayment(storage, snapshot.actorUserId);
  if (current.status === "none") return true;
  if (
    current.status !== "pending" ||
    !sameSnapshot(current.snapshot, snapshot)
  ) {
    return false;
  }
  try {
    storage.removeItem(storageKey);
    return (
      readPendingManualPayment(storage, snapshot.actorUserId).status === "none"
    );
  } catch {
    return false;
  }
}
