export type MonthlyInvoiceIssueBody = Readonly<{
  organizationId: string;
  locationId: string;
  familyId: string;
  familyPayerId: string;
  servicePeriod: string;
  dueDate: string;
  quoteHash: string;
}>;

export type PendingMonthlyInvoiceIssue = Readonly<{
  version: 1;
  key: string;
  body: MonthlyInvoiceIssueBody;
  scopeKey: string;
  hasAmbiguousAttempt: boolean;
}>;

export const PENDING_MONTHLY_INVOICE_ISSUE_STORAGE_KEY =
  "zaltyko:pending-monthly-invoice-issue:v1";

const PENDING_KEYS = "body,hasAmbiguousAttempt,key,scopeKey,version";
const BODY_KEYS =
  "dueDate,familyId,familyPayerId,locationId,organizationId,quoteHash,servicePeriod";
const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID = new RegExp(`^${UUID_PATTERN}$`, "iu");
const KEY = new RegExp(
  `^owner-monthly-invoice:${UUID_PATTERN}$`,
  "iu"
);
const QUOTE_HASH = /^[0-9a-f]{64}$/u;
const SERVICE_PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_PENDING_LENGTH = 4096;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PendingRead =
  | { status: "none" }
  | { status: "pending"; request: PendingMonthlyInvoiceIssue }
  | { status: "invalid" | "unavailable" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function parseBody(value: unknown): MonthlyInvoiceIssueBody | null {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== BODY_KEYS ||
    typeof value.organizationId !== "string" ||
    !UUID.test(value.organizationId) ||
    typeof value.locationId !== "string" ||
    !UUID.test(value.locationId) ||
    typeof value.familyId !== "string" ||
    !UUID.test(value.familyId) ||
    typeof value.familyPayerId !== "string" ||
    !UUID.test(value.familyPayerId) ||
    typeof value.servicePeriod !== "string" ||
    !SERVICE_PERIOD.test(value.servicePeriod) ||
    typeof value.dueDate !== "string" ||
    !isCalendarDate(value.dueDate) ||
    typeof value.quoteHash !== "string" ||
    !QUOTE_HASH.test(value.quoteHash)
  ) {
    return null;
  }

  return {
    organizationId: value.organizationId,
    locationId: value.locationId,
    familyId: value.familyId,
    familyPayerId: value.familyPayerId,
    servicePeriod: value.servicePeriod,
    dueDate: value.dueDate,
    quoteHash: value.quoteHash,
  };
}

function scopeKeyFor(body: MonthlyInvoiceIssueBody): string {
  return JSON.stringify([
    body.organizationId,
    body.locationId,
    body.servicePeriod,
  ]);
}

function parsePending(value: unknown): PendingMonthlyInvoiceIssue | null {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== PENDING_KEYS ||
    value.version !== 1 ||
    typeof value.key !== "string" ||
    !KEY.test(value.key) ||
    typeof value.scopeKey !== "string" ||
    typeof value.hasAmbiguousAttempt !== "boolean"
  ) {
    return null;
  }

  const body = parseBody(value.body);
  if (!body || value.scopeKey !== scopeKeyFor(body)) return null;

  return {
    version: 1,
    key: value.key,
    body,
    scopeKey: value.scopeKey,
    hasAmbiguousAttempt: value.hasAmbiguousAttempt,
  };
}

function sameCommand(
  left: PendingMonthlyInvoiceIssue,
  right: PendingMonthlyInvoiceIssue
): boolean {
  return (
    left.key === right.key &&
    left.scopeKey === right.scopeKey &&
    JSON.stringify(left.body) === JSON.stringify(right.body)
  );
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readPendingMonthlyInvoiceIssue(
  storage: StorageLike | null = defaultStorage()
): PendingRead {
  if (!storage) return { status: "unavailable" };

  try {
    const raw = storage.getItem(PENDING_MONTHLY_INVOICE_ISSUE_STORAGE_KEY);
    if (raw === null) return { status: "none" };
    if (raw.length > MAX_PENDING_LENGTH) return { status: "invalid" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: "invalid" };
    }

    const request = parsePending(parsed);
    return request ? { status: "pending", request } : { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }
}

export function persistPendingMonthlyInvoiceIssue(
  request: PendingMonthlyInvoiceIssue,
  storage: StorageLike | null = defaultStorage()
): boolean {
  const normalized = parsePending(request);
  if (!normalized || !storage) return false;

  const current = readPendingMonthlyInvoiceIssue(storage);
  if (current.status === "pending") {
    if (!sameCommand(current.request, normalized)) return false;
    if (
      current.request.hasAmbiguousAttempt &&
      !normalized.hasAmbiguousAttempt
    ) {
      return false;
    }
  } else if (current.status !== "none") {
    return false;
  }

  try {
    const encoded = JSON.stringify(normalized);
    storage.setItem(PENDING_MONTHLY_INVOICE_ISSUE_STORAGE_KEY, encoded);
    const saved = readPendingMonthlyInvoiceIssue(storage);
    return (
      saved.status === "pending" &&
      JSON.stringify(saved.request) === encoded
    );
  } catch {
    return false;
  }
}

export function clearPendingMonthlyInvoiceIssue(
  request: PendingMonthlyInvoiceIssue,
  storage: StorageLike | null = defaultStorage()
): boolean {
  if (!storage) return false;

  const normalized = parsePending(request);
  const current = readPendingMonthlyInvoiceIssue(storage);
  if (current.status === "none") return true;
  if (
    !normalized ||
    current.status !== "pending" ||
    !sameCommand(current.request, normalized)
  ) {
    return false;
  }

  try {
    storage.removeItem(PENDING_MONTHLY_INVOICE_ISSUE_STORAGE_KEY);
    return readPendingMonthlyInvoiceIssue(storage).status === "none";
  } catch {
    return false;
  }
}
