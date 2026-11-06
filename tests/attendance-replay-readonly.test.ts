import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertAccess: vi.fn(),
  assertWritable: vi.fn(),
  lock: vi.fn(),
  findEvent: vi.fn(),
  assertPayload: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/saas-billing/application/organization-usage", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/saas-billing/application/organization-usage")>(),
  assertOrganizationOperationalWritable: mocks.assertWritable,
}));
vi.mock("@/modules/shared/infrastructure/operational-authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/modules/shared/infrastructure/operational-authorization")>();
  mocks.assertAccess.mockImplementation(actual.assertOperationalAccess);
  return { ...actual, assertOperationalAccess: mocks.assertAccess };
});
vi.mock("@/modules/shared/infrastructure/transactional-records", async importOriginal => {
  const actual = await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>();
  mocks.assertPayload.mockImplementation(actual.assertIdempotencyPayload);
  return {
    ...actual,
    appendAuditEntry: mocks.appendAudit,
    appendOutboxEvent: mocks.appendOutbox,
    assertIdempotencyPayload: mocks.assertPayload,
    findOutboxEvent: mocks.findEvent,
    lockCommand: mocks.lock,
  };
});

import {
  attendanceRecords,
  memberLocationScopes,
  organizationMembers,
  sessionStaff,
  sessions,
  staffProfiles,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { recordAttendance } from "@/modules/attendance/application/attendance-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const sessionId = "10000000-0000-4000-8000-000000000003";
const enrollmentId = "10000000-0000-4000-8000-000000000004";
const attendanceId = "10000000-0000-4000-8000-000000000005";
const memberId = "10000000-0000-4000-8000-000000000006";
const userId = "10000000-0000-4000-8000-000000000007";
const idempotencyKey = "attendance-replay-001";
const actor = { userId, memberId };
const dialect = new PgDialect();
const priorEvent = {
  aggregateType: "attendance",
  aggregateId: attendanceId,
  payload: { sessionId, enrollmentId, status: "present", attendanceId },
};
const priorAttendance = {
  id: attendanceId,
  organizationId,
  locationId,
  sessionId,
  enrollmentId,
  status: "present",
};
let member: {
  id: string;
  userId: string;
  organizationId: string;
  status: string;
  role: string;
  locationScopeMode: string;
};
let eventPresent: boolean;
let locationScoped: boolean;
let coachAssigned: boolean;
let attendanceExists: boolean;
let attendanceRow: typeof priorAttendance;
let profileIsActive: boolean;
let profileMemberId: string;
let writes: ReturnType<typeof vi.fn>;
let execute: ReturnType<typeof vi.fn>;

function makeTransaction() {
  member = {
    id: memberId,
    userId,
    organizationId,
    status: "active",
    role: "owner",
    locationScopeMode: "selected",
  };
  eventPresent = true;
  locationScoped = true;
  coachAssigned = true;
  attendanceExists = true;
  attendanceRow = priorAttendance;
  profileIsActive = true;
  profileMemberId = memberId;
  writes = vi.fn(() => { throw new Error("No debe haber escrituras en estas ramas"); });
  execute = vi.fn(async () => ({ rows: [] }));
  const select = vi.fn(() => {
    let table: unknown;
    let whereParams: unknown[] = [];
    let whereSql = "";
    const matchesBound = (sqlText: string, params: unknown[], column: string, value: unknown) => {
      const predicate = new RegExp(`${column}\\s*=\\s*\\$(\\d+)`).exec(sqlText);
      return predicate !== null && params[Number(predicate[1]) - 1] === value;
    };
    let profileJoinIsCorrect = false;
    const query = {
      from: (value: unknown) => { table = value; return query; },
      innerJoin: (_value: unknown, clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const compiled = dialect.sqlToQuery(clause);
        const normalized = compiled.sql.toLowerCase().replaceAll('"', "");
        const memberPredicate = /zaltyko\.staff_profiles\.member_id\s*=\s*\$(\d+)/.exec(
          normalized
        );
        const activePredicate = /zaltyko\.staff_profiles\.is_active\s*=\s*\$(\d+)/.exec(
          normalized
        );
        profileJoinIsCorrect = _value === staffProfiles
          && compiled.params.length === 2
          && memberPredicate !== null
          && compiled.params[Number(memberPredicate[1]) - 1] === memberId
          && activePredicate !== null
          && compiled.params[Number(activePredicate[1]) - 1] === true
          && /zaltyko\.staff_profiles\.organization_id\s*=\s*zaltyko\.session_staff\.organization_id/.test(normalized)
          && /zaltyko\.staff_profiles\.id\s*=\s*zaltyko\.session_staff\.staff_profile_id/.test(normalized);
        return query;
      },
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const compiled = dialect.sqlToQuery(clause);
        whereSql = compiled.sql.toLowerCase().replaceAll('"', "");
        whereParams = compiled.params;
        return query;
      },
      limit: async () => {
        if (table === sessions) {
          return matchesBound(whereSql, whereParams, "sessions.organization_id", organizationId)
            && matchesBound(whereSql, whereParams, "sessions.id", sessionId)
            ? [{ id: sessionId, organizationId, locationId, status: "scheduled" }]
            : [];
        }
        if (table === organizationMembers) {
          const matches = member.id === memberId
            && member.userId === userId
            && member.organizationId === organizationId
            && member.status === "active"
            && whereParams.length === 4
            && matchesBound(whereSql, whereParams, "organization_members.organization_id", organizationId)
            && matchesBound(whereSql, whereParams, "organization_members.user_id", userId)
            && matchesBound(whereSql, whereParams, "organization_members.id", memberId)
            && matchesBound(whereSql, whereParams, "organization_members.status", "active");
          return matches ? [member] : [];
        }
        if (table === memberLocationScopes) {
          return locationScoped
            && whereParams.length === 3
            && matchesBound(whereSql, whereParams, "member_location_scopes.organization_id", organizationId)
            && matchesBound(whereSql, whereParams, "member_location_scopes.member_id", memberId)
            && matchesBound(whereSql, whereParams, "member_location_scopes.location_id", locationId)
            ? [{ id: "synthetic-location-scope" }]
            : [];
        }
        if (table === sessionStaff) {
          const matches = coachAssigned
            && profileJoinIsCorrect
            && profileIsActive
            && profileMemberId === memberId
            && matchesBound(whereSql, whereParams, "session_staff.organization_id", organizationId)
            && matchesBound(whereSql, whereParams, "session_staff.session_id", sessionId);
          return matches ? [{ id: "synthetic-session-staff" }] : [];
        }
        if (table === attendanceRecords) {
          return attendanceExists
            && whereParams.length === 2
            && matchesBound(whereSql, whereParams, "attendance_records.organization_id", organizationId)
            && matchesBound(whereSql, whereParams, "attendance_records.id", attendanceId)
            ? [attendanceRow]
            : [];
        }
        if (table === staffProfiles) return [];
        throw new Error("Consulta inesperada en la regresión de replay de asistencia");
      },
    };
    return query;
  });
  const tx = { select, execute, insert: writes, update: writes, delete: writes } as unknown as TransactionClient;
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return {
    tx,
    setRole: (role: string) => { member.role = role; },
    setProfileIsActive: (isActive: boolean) => { profileIsActive = isActive; },
    setProfileMemberId: (id: string) => { profileMemberId = id; },
  };
}

function run(tx: TransactionClient) {
  return recordAttendance({
    organizationId,
    expectedLocationId: locationId,
    sessionId,
    enrollmentId,
    status: "present",
    idempotencyKey,
    actor,
  });
}

function expectNoWrites() {
  expect(writes).not.toHaveBeenCalled();
  expect(mocks.appendAudit).not.toHaveBeenCalled();
  expect(mocks.appendOutbox).not.toHaveBeenCalled();
  for (const [query] of execute.mock.calls) {
    expect(dialect.sqlToQuery(query).sql.trim()).toMatch(/^select\b/i);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lock.mockResolvedValue(undefined);
  mocks.assertWritable.mockRejectedValue(
    Object.assign(new Error("Academia de solo lectura"), {
      code: "PLAN_OVER_CAPACITY",
      status: 409,
    })
  );
  mocks.findEvent.mockImplementation(async (_tx, input) => {
    if (
      eventPresent
      && input.organizationId === organizationId
      && input.eventName === "attendance.recorded"
      && input.idempotencyKey === idempotencyKey
    ) {
      return priorEvent;
    }
    return null;
  });
});

describe("replay de asistencia cuando la academia está en solo lectura", () => {
  it("recupera el registro previo sin volver a exigir capacidad de escritura", async () => {
    const { tx } = makeTransaction();

    await expect(run(tx)).resolves.toEqual(priorAttendance);

    expect(mocks.assertAccess).toHaveBeenCalledWith(tx, {
      organizationId,
      locationId,
      actor,
      allowedRoles: ["owner", "manager", "admin", "coach"],
    });
    expect(mocks.findEvent).toHaveBeenCalledWith(tx, {
      organizationId,
      eventName: "attendance.recorded",
      idempotencyKey,
    });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("mantiene el control de escritura para una asistencia nueva", async () => {
    const { tx } = makeTransaction();
    eventPresent = false;

    await expect(run(tx)).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });

    expect(mocks.findEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.assertWritable.mock.invocationCallOrder[0]
    );
    expectNoWrites();
  });

  it("no devuelve el replay a una membresía inactiva", async () => {
    const { tx } = makeTransaction();
    member.status = "inactive";

    await expect(run(tx)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.findEvent).not.toHaveBeenCalled();
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("mantiene la restricción de sede antes de consultar el replay", async () => {
    const { tx } = makeTransaction();
    locationScoped = false;

    await expect(run(tx)).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });

    expect(mocks.findEvent).not.toHaveBeenCalled();
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("mantiene la asignación de sesión para un coach antes de consultar el replay", async () => {
    const { tx, setRole } = makeTransaction();
    setRole("coach");
    coachAssigned = false;

    await expect(run(tx)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.findEvent).not.toHaveBeenCalled();
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("permite al coach asignado recuperar el replay sin capacidad de escritura", async () => {
    const { tx, setRole } = makeTransaction();
    setRole("coach");

    await expect(run(tx)).resolves.toEqual(priorAttendance);

    expect(mocks.findEvent).toHaveBeenCalledOnce();
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each([
    { description: "inactivo", active: false, assignedMemberId: memberId },
    { description: "asociado a otro miembro", active: true, assignedMemberId: "10000000-0000-4000-8000-000000000099" },
  ])("deniega al coach si el perfil está $description", async ({ active, assignedMemberId }) => {
    const { tx, setRole, setProfileIsActive, setProfileMemberId } = makeTransaction();
    setRole("coach");
    setProfileIsActive(active);
    setProfileMemberId(assignedMemberId);

    await expect(run(tx)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.findEvent).not.toHaveBeenCalled();
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("rechaza una clave previa con otro estado antes de devolver datos", async () => {
    const { tx } = makeTransaction();
    mocks.findEvent.mockResolvedValueOnce({
      payload: { ...priorEvent.payload, status: "absent" },
    });

    await expect(run(tx)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("no reinterpreta como una nueva escritura un evento cuyo registro desapareció", async () => {
    const { tx } = makeTransaction();
    attendanceExists = false;

    await expect(run(tx)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("rechaza un evento cuyo registro persistido ya no coincide con el resultado", async () => {
    const { tx } = makeTransaction();
    attendanceRow = { ...priorAttendance, status: "absent" };

    await expect(run(tx)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });
});
