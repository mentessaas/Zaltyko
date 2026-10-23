export type AttendanceCommandBody = {
  organizationId: string;
  locationId: string;
  enrollmentId: string;
  status: "present" | "absent" | "excused" | "late";
};

export type AttendanceRetryRequest = {
  key: string;
  body: AttendanceCommandBody;
  sessionId: string;
  uncertain: boolean;
};

const STORAGE_KEY = "zaltyko:owner-attendance-pending:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^owner-attendance:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["present", "absent", "excused", "late"]);
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeRequest(value: unknown): AttendanceRetryRequest | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "body,key,sessionId,uncertain" ||
      typeof value.key !== "string" || !IDEMPOTENCY_KEY.test(value.key) ||
      typeof value.sessionId !== "string" || !UUID.test(value.sessionId) || typeof value.uncertain !== "boolean" ||
      !isRecord(value.body) || Object.keys(value.body).sort().join(",") !== "enrollmentId,locationId,organizationId,status" ||
      typeof value.body.organizationId !== "string" || !UUID.test(value.body.organizationId) ||
      typeof value.body.locationId !== "string" || !UUID.test(value.body.locationId) ||
      typeof value.body.enrollmentId !== "string" || !UUID.test(value.body.enrollmentId) ||
      typeof value.body.status !== "string" || !STATUSES.has(value.body.status)) return null;
  return {
    key: value.key,
    sessionId: value.sessionId,
    uncertain: value.uncertain,
    body: {
      organizationId: value.body.organizationId,
      locationId: value.body.locationId,
      enrollmentId: value.body.enrollmentId,
      status: value.body.status as AttendanceCommandBody["status"],
    },
  };
}

function sameCommand(left: AttendanceRetryRequest, right: AttendanceRetryRequest): boolean {
  return left.key === right.key && left.sessionId === right.sessionId &&
    left.body.organizationId === right.body.organizationId && left.body.locationId === right.body.locationId &&
    left.body.enrollmentId === right.body.enrollmentId && left.body.status === right.body.status;
}

export function readAttendanceRetries(storage: StorageLike):
  | { status: "ready"; requests: AttendanceRetryRequest[] }
  | { status: "invalid" | "unavailable" } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { status: "ready", requests: [] };
    if (raw.length > 16384) return { status: "invalid" };
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 32) return { status: "invalid" };
    const requests = value.map(decodeRequest);
    if (requests.some((request) => request === null)) return { status: "invalid" };
    const decoded = requests as AttendanceRetryRequest[];
    if (new Set(decoded.map((request) => request.key)).size !== decoded.length) return { status: "invalid" };
    return { status: "ready", requests: decoded };
  } catch {
    return { status: "unavailable" };
  }
}

export function persistAttendanceRetry(storage: StorageLike, request: AttendanceRetryRequest): boolean {
  const current = readAttendanceRetries(storage);
  if (current.status !== "ready") return false;
  const existing = current.requests.find((item) => item.key === request.key);
  if (existing && !sameCommand(existing, request)) return false;
  const requests = existing
    ? current.requests.map((item) => item.key === request.key ? request : item)
    : [...current.requests, request];
  if (requests.length > 32) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(requests));
    const saved = readAttendanceRetries(storage);
    return saved.status === "ready" && saved.requests.some((item) => sameCommand(item, request) && item.uncertain === request.uncertain);
  } catch {
    return false;
  }
}

export function clearAttendanceRetry(storage: StorageLike, request: AttendanceRetryRequest): boolean {
  const current = readAttendanceRetries(storage);
  if (current.status !== "ready") return false;
  const existing = current.requests.find((item) => item.key === request.key);
  if (!existing) return true;
  if (!sameCommand(existing, request)) return false;
  const remaining = current.requests.filter((item) => item.key !== request.key);
  try {
    if (remaining.length) storage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    else storage.removeItem(STORAGE_KEY);
    const saved = readAttendanceRetries(storage);
    return saved.status === "ready" && !saved.requests.some((item) => item.key === request.key);
  } catch {
    return false;
  }
}

export function validAttendanceReceipt(payload: unknown, request: AttendanceRetryRequest): boolean {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) return false;
  const data = payload.data;
  return typeof data.id === "string" && UUID.test(data.id) &&
    data.sessionId === request.sessionId && data.enrollmentId === request.body.enrollmentId &&
    data.status === request.body.status && typeof data.recordedAt === "string" &&
    Number.isFinite(Date.parse(data.recordedAt)) && new Date(data.recordedAt).toISOString() === data.recordedAt;
}

const DEFINITIVE_BUSINESS_REJECTIONS = new Map<number, Set<string>>([
  [400, new Set(["https://zaltyko.com/problems/invalid-session-attendance-command"])],
  [409, new Set([
    "https://zaltyko.com/problems/invalid-state-transition",
    "https://zaltyko.com/problems/invalid-relation",
    "https://zaltyko.com/problems/plan-over-capacity",
  ])],
]);

export function isDefinitiveAttendanceRejection(status: number, payload: unknown, previouslyUncertain: boolean): boolean {
  if (status === 401 || status === 403 || status === 404 || status === 429 || !isRecord(payload)) return false;
  if (status === 400 && previouslyUncertain) return false;
  return payload.status === status && typeof payload.title === "string" && payload.title.trim().length > 0 &&
    typeof payload.detail === "string" && payload.detail.trim().length > 0 &&
    DEFINITIVE_BUSINESS_REJECTIONS.get(status)?.has(String(payload.type)) === true;
}
