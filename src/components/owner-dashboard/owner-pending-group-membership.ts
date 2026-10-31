export type GroupMembershipSnapshot =
  | {
      version: 1;
      organizationId: string;
      groupId: string;
      kind: "add";
      athleteId: string;
      startsOn: string;
      status: "active";
      idempotencyKey: string;
    }
  | {
      version: 1;
      organizationId: string;
      groupId: string;
      kind: "transition";
      membershipId: string;
      expectedStatus: MembershipStatus;
      toStatus: "active" | "paused" | "ended";
      effectiveOn: string;
      idempotencyKey: string;
    };

export type GroupMembershipCommand = {
  organizationId: string;
  groupId: string;
  kind: "add" | "transition";
  endpoint: string;
  method: "POST" | "PATCH";
  body: string;
  idempotencyKey: string;
  athleteId?: string;
  membershipId?: string;
};

export const PENDING_GROUP_MEMBERSHIP_STORAGE_KEY = "zaltyko:pending-group-membership:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type MembershipStatus = "pending" | "active" | "paused" | "ended";
const MEMBERSHIP_STATUSES = new Set(["pending", "active", "paused", "ended"]);
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseSnapshot(value: unknown): GroupMembershipSnapshot | null {
  if (!record(value) || value.version !== 1 || typeof value.organizationId !== "string" || !UUID.test(value.organizationId) ||
      typeof value.groupId !== "string" || !UUID.test(value.groupId) ||
      typeof value.idempotencyKey !== "string" || !UUID.test(value.idempotencyKey)) return null;
  if (value.kind === "add" && Object.keys(value).sort().join(",") === "athleteId,groupId,idempotencyKey,kind,organizationId,startsOn,status,version" &&
      typeof value.athleteId === "string" && UUID.test(value.athleteId) && validDate(value.startsOn) && value.status === "active") {
    return value as GroupMembershipSnapshot;
  }
  if (value.kind === "transition" && Object.keys(value).sort().join(",") === "effectiveOn,expectedStatus,groupId,idempotencyKey,kind,membershipId,organizationId,toStatus,version" &&
      typeof value.membershipId === "string" && UUID.test(value.membershipId) &&
      typeof value.expectedStatus === "string" && MEMBERSHIP_STATUSES.has(value.expectedStatus) &&
      typeof value.toStatus === "string" && ["active", "paused", "ended"].includes(value.toStatus) && validDate(value.effectiveOn)) {
    return value as GroupMembershipSnapshot;
  }
  return null;
}

export function commandFromGroupMembershipSnapshot(snapshot: GroupMembershipSnapshot): GroupMembershipCommand {
  if (snapshot.kind === "add") {
    return {
      organizationId: snapshot.organizationId,
      groupId: snapshot.groupId,
      kind: "add",
      athleteId: snapshot.athleteId,
      endpoint: `/api/v1/owner/groups/${snapshot.groupId}/memberships`,
      method: "POST",
      idempotencyKey: snapshot.idempotencyKey,
      body: JSON.stringify({ organizationId: snapshot.organizationId, athleteId: snapshot.athleteId, startsOn: snapshot.startsOn, status: snapshot.status }),
    };
  }
  return {
    organizationId: snapshot.organizationId,
    groupId: snapshot.groupId,
    kind: "transition",
    membershipId: snapshot.membershipId,
    endpoint: `/api/v1/owner/groups/${snapshot.groupId}/memberships/${snapshot.membershipId}`,
    method: "PATCH",
    idempotencyKey: snapshot.idempotencyKey,
    body: JSON.stringify({ organizationId: snapshot.organizationId, expectedStatus: snapshot.expectedStatus, toStatus: snapshot.toStatus, effectiveOn: snapshot.effectiveOn }),
  };
}

export function snapshotFromGroupMembershipCommand(command: GroupMembershipCommand): GroupMembershipSnapshot | null {
  let body: unknown;
  try { body = JSON.parse(command.body); } catch { return null; }
  if (!record(body) || body.organizationId !== command.organizationId || !UUID.test(command.organizationId) ||
      !UUID.test(command.groupId) || !UUID.test(command.idempotencyKey)) return null;
  if (command.kind === "add" && command.method === "POST" && record(body) &&
      Object.keys(body).sort().join(",") === "athleteId,organizationId,startsOn,status" &&
      typeof body.athleteId === "string" && UUID.test(body.athleteId) && validDate(body.startsOn) && body.status === "active") {
    return { version: 1, organizationId: command.organizationId, groupId: command.groupId, kind: "add", athleteId: body.athleteId, startsOn: body.startsOn, status: "active", idempotencyKey: command.idempotencyKey };
  }
  if (command.kind === "transition" && command.method === "PATCH" && command.membershipId && UUID.test(command.membershipId) &&
      Object.keys(body).sort().join(",") === "effectiveOn,expectedStatus,organizationId,toStatus" &&
      typeof body.expectedStatus === "string" && MEMBERSHIP_STATUSES.has(body.expectedStatus) &&
      typeof body.toStatus === "string" && ["active", "paused", "ended"].includes(body.toStatus) && validDate(body.effectiveOn)) {
    return { version: 1, organizationId: command.organizationId, groupId: command.groupId, kind: "transition", membershipId: command.membershipId, expectedStatus: body.expectedStatus as MembershipStatus, toStatus: body.toStatus as "active" | "paused" | "ended", effectiveOn: body.effectiveOn, idempotencyKey: command.idempotencyKey };
  }
  return null;
}

export function readPendingGroupMembership(storage: StorageLike):
  | { status: "none" }
  | { status: "pending"; snapshot: GroupMembershipSnapshot }
  | { status: "invalid" | "unavailable" } {
  try {
    const raw = storage.getItem(PENDING_GROUP_MEMBERSHIP_STORAGE_KEY);
    if (raw === null) return { status: "none" };
    if (raw.length > 4096) return { status: "invalid" };
    const parsed: unknown = JSON.parse(raw);
    const snapshot = parseSnapshot(parsed);
    return snapshot ? { status: "pending", snapshot } : { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }
}

export function persistPendingGroupMembership(storage: StorageLike, command: GroupMembershipCommand): boolean {
  const snapshot = snapshotFromGroupMembershipCommand(command);
  if (!snapshot) return false;
  const current = readPendingGroupMembership(storage);
  if (current.status === "pending") return JSON.stringify(current.snapshot) === JSON.stringify(snapshot);
  if (current.status !== "none") return false;
  try {
    storage.setItem(PENDING_GROUP_MEMBERSHIP_STORAGE_KEY, JSON.stringify(snapshot));
    const saved = readPendingGroupMembership(storage);
    return saved.status === "pending" && JSON.stringify(saved.snapshot) === JSON.stringify(snapshot);
  } catch {
    return false;
  }
}

export function clearPendingGroupMembership(storage: StorageLike, command: GroupMembershipCommand): boolean {
  const snapshot = snapshotFromGroupMembershipCommand(command);
  if (!snapshot) return false;
  const current = readPendingGroupMembership(storage);
  if (current.status === "none") return true;
  if (current.status !== "pending" || JSON.stringify(current.snapshot) !== JSON.stringify(snapshot)) return false;
  try {
    storage.removeItem(PENDING_GROUP_MEMBERSHIP_STORAGE_KEY);
    return readPendingGroupMembership(storage).status === "none";
  } catch {
    return false;
  }
}
