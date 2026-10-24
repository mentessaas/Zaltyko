export type ManualPaymentMethod =
  | "cash"
  | "bank_transfer"
  | "card_terminal"
  | "other";

export type ManualPaymentRetrySnapshot = Readonly<{
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

export type ManualPaymentRetryBody = Readonly<{
  organizationId: string;
  chargeId: string;
  amountCents: number;
  method: ManualPaymentMethod;
  receivedAt: string;
  reference?: string;
}>;

export const PENDING_MANUAL_PAYMENT_STORAGE_KEY =
  "zaltyko:pending-manual-payment:v1";

const SNAPSHOT_KEYS =
  "amountCents,chargeId,currency,idempotencyKey,method,organizationId,receivedAt,referenceSha256,version";
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
    Object.keys(value).sort().join(",") !== SNAPSHOT_KEYS ||
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
  return value as ManualPaymentRetrySnapshot;
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
  body: ManualPaymentRetryBody;
  currency: string;
  idempotencyKey: string;
}): Promise<ManualPaymentRetrySnapshot | null> {
  if (!CURRENCY.test(args.currency)) return null;
  const referenceSha256 = await fingerprintManualPaymentReference(
    args.body.reference
  );
  return parseSnapshot({
    version: 1,
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
  | { status: "reference-required" | "reference-mismatch" }
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
      receivedAt: snapshot.receivedAt,
      ...(snapshot.referenceSha256 !== null ? { reference } : {}),
    },
  };
}

export function readPendingManualPayment(storage: StorageLike):
  | { status: "none" }
  | { status: "pending"; snapshot: ManualPaymentRetrySnapshot }
  | { status: "invalid" | "unavailable" } {
  try {
    const raw = storage.getItem(PENDING_MANUAL_PAYMENT_STORAGE_KEY);
    if (raw === null) return { status: "none" };
    if (raw.length > MAX_SNAPSHOT_LENGTH) return { status: "invalid" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: "invalid" };
    }
    const snapshot = parseSnapshot(parsed);
    return snapshot ? { status: "pending", snapshot } : { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }
}

export function persistPendingManualPayment(
  storage: StorageLike,
  snapshot: ManualPaymentRetrySnapshot
): boolean {
  const normalized = parseSnapshot(snapshot);
  if (!normalized) return false;
  const current = readPendingManualPayment(storage);
  if (current.status === "pending") {
    return JSON.stringify(current.snapshot) === JSON.stringify(normalized);
  }
  if (current.status !== "none") return false;
  try {
    const encoded = JSON.stringify(normalized);
    storage.setItem(PENDING_MANUAL_PAYMENT_STORAGE_KEY, encoded);
    const saved = readPendingManualPayment(storage);
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
  const current = readPendingManualPayment(storage);
  if (current.status === "none") return true;
  if (
    current.status !== "pending" ||
    JSON.stringify(current.snapshot) !== JSON.stringify(snapshot)
  ) {
    return false;
  }
  try {
    storage.removeItem(PENDING_MANUAL_PAYMENT_STORAGE_KEY);
    return readPendingManualPayment(storage).status === "none";
  } catch {
    return false;
  }
}
