export type OwnerStaffOperation = "create" | "update" | "archive" | "reactivate";

export type OwnerStaffCommand = Readonly<{
  version: 1;
  organizationId: string;
  operation: OwnerStaffOperation;
  staffProfileId?: string;
  method: "POST" | "PATCH";
  endpoint: string;
  idempotencyKey: string;
  body: string;
  attempted: boolean;
}>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type OwnerStaffJournalRead =
  | { kind: "none" }
  | { kind: "pending"; command: OwnerStaffCommand }
  | { kind: "invalid" }
  | { kind: "unavailable" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERSION = /^v1_[a-f0-9]{64}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._~:-]{8,180}$/u;
const COLLECTION_ENDPOINT = "/api/v1/owner/staff";
const STORAGE_PREFIX = "zaltyko:owner-staff-command:v1:";
const LOCK_PREFIX = "zaltyko:owner-staff-command-lock:v1:";

export type OwnerStaffLockResult<T> =
  | { status: "acquired"; value: T }
  | { status: "busy" }
  | { status: "unsupported" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100 && value.trim() === value;
}

function parseBody(command: Record<string, unknown>): boolean {
  if (typeof command.body !== "string" || command.body.length > 1024) return false;
  try {
    const body: unknown = JSON.parse(command.body);
    if (!isRecord(body) || body.organizationId !== command.organizationId) return false;
    switch (command.operation) {
      case "create":
        return !("staffProfileId" in command) && command.method === "POST" && command.endpoint === COLLECTION_ENDPOINT &&
          exactKeys(body, ["organizationId", "givenName", "familyName", "preferredName"]) &&
          isName(body.givenName) && isName(body.familyName) &&
          (body.preferredName === null || isName(body.preferredName));
      case "update":
        return typeof command.staffProfileId === "string" && UUID.test(command.staffProfileId) &&
          command.method === "PATCH" && command.endpoint === `${COLLECTION_ENDPOINT}/${command.staffProfileId}` &&
          exactKeys(body, ["organizationId", "givenName", "familyName", "preferredName", "version"]) &&
          isName(body.givenName) && isName(body.familyName) &&
          (body.preferredName === null || isName(body.preferredName)) &&
          typeof body.version === "string" && VERSION.test(body.version);
      case "archive":
      case "reactivate":
        return typeof command.staffProfileId === "string" && UUID.test(command.staffProfileId) &&
          command.method === "POST" && command.endpoint === `${COLLECTION_ENDPOINT}/${command.staffProfileId}/${command.operation}` &&
          exactKeys(body, ["organizationId", "version"]) &&
          typeof body.version === "string" && VERSION.test(body.version);
      default:
        return false;
    }
  } catch {
    return false;
  }
}

function decodeCommand(raw: string | null, organizationId: string): OwnerStaffJournalRead {
  if (raw === null) return { kind: "none" };
  if (raw.length > 4096) return { kind: "invalid" };
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || value.organizationId !== organizationId ||
        typeof value.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(value.idempotencyKey) ||
        !["create", "update", "archive", "reactivate"].includes(String(value.operation)) ||
        !["POST", "PATCH"].includes(String(value.method)) || typeof value.endpoint !== "string" ||
        typeof value.attempted !== "boolean" ||
        !parseBody(value)) return { kind: "invalid" };
    const expectedKeys = value.operation === "create"
      ? ["version", "organizationId", "operation", "method", "endpoint", "idempotencyKey", "body", "attempted"]
      : ["version", "organizationId", "operation", "staffProfileId", "method", "endpoint", "idempotencyKey", "body", "attempted"];
    if (!exactKeys(value, expectedKeys)) return { kind: "invalid" };
    return { kind: "pending", command: value as OwnerStaffCommand };
  } catch {
    return { kind: "invalid" };
  }
}

export function ownerStaffCommandStorageKey(organizationId: string): string {
  return `${STORAGE_PREFIX}${organizationId}`;
}

export function readOwnerStaffCommand(storage: StorageLike, organizationId: string): OwnerStaffJournalRead {
  if (!UUID.test(organizationId)) return { kind: "invalid" };
  try {
    return decodeCommand(storage.getItem(ownerStaffCommandStorageKey(organizationId)), organizationId);
  } catch {
    return { kind: "unavailable" };
  }
}

export function makeOwnerStaffCommand(
  input:
    | { operation: "create"; organizationId: string; givenName: string; familyName: string; preferredName: string | null }
    | { operation: "update"; organizationId: string; staffProfileId: string; givenName: string; familyName: string; preferredName: string | null; version: string }
    | { operation: "archive" | "reactivate"; organizationId: string; staffProfileId: string; version: string },
  idempotencyKey: string,
): OwnerStaffCommand {
  if (!UUID.test(input.organizationId) || !IDEMPOTENCY_KEY.test(idempotencyKey)) throw new Error("Invalid staff command identity");
  if (input.operation === "create") {
    return {
      version: 1,
      organizationId: input.organizationId,
      operation: input.operation,
      method: "POST",
      endpoint: COLLECTION_ENDPOINT,
      idempotencyKey,
      body: JSON.stringify({
        organizationId: input.organizationId,
        givenName: input.givenName,
        familyName: input.familyName,
        preferredName: input.preferredName,
      }),
      attempted: false,
    };
  }
  if (!UUID.test(input.staffProfileId) || !VERSION.test(input.version)) throw new Error("Invalid staff profile version");
  if (input.operation === "update") {
    return {
      version: 1,
      organizationId: input.organizationId,
      operation: input.operation,
      staffProfileId: input.staffProfileId,
      method: "PATCH",
      endpoint: `${COLLECTION_ENDPOINT}/${input.staffProfileId}`,
      idempotencyKey,
      body: JSON.stringify({
        organizationId: input.organizationId,
        givenName: input.givenName,
        familyName: input.familyName,
        preferredName: input.preferredName,
        version: input.version,
      }),
      attempted: false,
    };
  }
  return {
    version: 1,
    organizationId: input.organizationId,
    operation: input.operation,
    staffProfileId: input.staffProfileId,
    method: "POST",
    endpoint: `${COLLECTION_ENDPOINT}/${input.staffProfileId}/${input.operation}`,
    idempotencyKey,
    body: JSON.stringify({ organizationId: input.organizationId, version: input.version }),
    attempted: false,
  };
}

function sameCommand(left: OwnerStaffCommand, right: OwnerStaffCommand): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameOwnerStaffCommandRequest(left: OwnerStaffCommand, right: OwnerStaffCommand): boolean {
  return left.organizationId === right.organizationId &&
    left.operation === right.operation &&
    left.staffProfileId === right.staffProfileId &&
    left.method === right.method &&
    left.endpoint === right.endpoint &&
    left.idempotencyKey === right.idempotencyKey &&
    left.body === right.body;
}

export async function withOwnerStaffCommandLock<T>(
  organizationId: string,
  operation: () => Promise<T>,
): Promise<OwnerStaffLockResult<T>> {
  if (!UUID.test(organizationId)) return { status: "unsupported" };
  try {
    const locks = (globalThis.navigator as Navigator & {
      locks?: {
        request<R>(
          name: string,
          options: { mode: "exclusive"; ifAvailable: true },
          callback: (lock: object | null) => Promise<R>,
        ): Promise<R>;
      };
    } | undefined)?.locks;
    if (!locks || typeof locks.request !== "function") return { status: "unsupported" };
    return await locks.request(
      `${LOCK_PREFIX}${organizationId}`,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => lock === null
        ? { status: "busy" } as const
        : { status: "acquired", value: await operation() } as const,
    );
  } catch {
    return { status: "unsupported" };
  }
}

export function persistOwnerStaffCommand(storage: StorageLike, command: OwnerStaffCommand): boolean {
  const current = readOwnerStaffCommand(storage, command.organizationId);
  if (current.kind === "pending") return sameCommand(current.command, command);
  if (current.kind !== "none") return false;
  try {
    storage.setItem(ownerStaffCommandStorageKey(command.organizationId), JSON.stringify(command));
    const saved = readOwnerStaffCommand(storage, command.organizationId);
    return saved.kind === "pending" && sameCommand(saved.command, command);
  } catch {
    return false;
  }
}

export function markOwnerStaffCommandAttempted(
  storage: StorageLike,
  command: OwnerStaffCommand,
): OwnerStaffCommand | null {
  const current = readOwnerStaffCommand(storage, command.organizationId);
  if (current.kind !== "pending") return null;
  if (sameCommand(current.command, command)) {
    if (command.attempted) return command;
  } else {
    const sameRequest = current.command.organizationId === command.organizationId &&
      current.command.operation === command.operation &&
      current.command.staffProfileId === command.staffProfileId &&
      current.command.method === command.method &&
      current.command.endpoint === command.endpoint &&
      current.command.idempotencyKey === command.idempotencyKey &&
      current.command.body === command.body;
    if (!sameRequest) return null;
    if (current.command.attempted) return current.command;
  }
  const attempted = { ...current.command, attempted: true };
  try {
    storage.setItem(ownerStaffCommandStorageKey(command.organizationId), JSON.stringify(attempted));
    const saved = readOwnerStaffCommand(storage, command.organizationId);
    return saved.kind === "pending" && sameCommand(saved.command, attempted) ? saved.command : null;
  } catch {
    return null;
  }
}

export function clearOwnerStaffCommand(storage: StorageLike, command: OwnerStaffCommand): boolean {
  const key = ownerStaffCommandStorageKey(command.organizationId);
  const current = readOwnerStaffCommand(storage, command.organizationId);
  if (current.kind === "none") return true;
  if (current.kind !== "pending" || !sameCommand(current.command, command)) return false;
  try {
    storage.removeItem(key);
    return readOwnerStaffCommand(storage, command.organizationId).kind === "none";
  } catch {
    return false;
  }
}
