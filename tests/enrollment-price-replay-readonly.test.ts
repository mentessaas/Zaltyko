import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  assertAccess: vi.fn(),
  assertWritable: vi.fn(),
  lock: vi.fn(),
  findEvent: vi.fn(),
  assertPayload: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/modules/saas-billing/application/organization-usage", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/saas-billing/application/organization-usage")>(),
  assertOrganizationOperationalWritable: mocks.assertWritable,
}));
vi.mock("@/modules/shared/infrastructure/operational-authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/modules/shared/infrastructure/operational-authorization")>();
  mocks.assertAccess.mockImplementation(actual.assertOperationalAccess);
  return { ...actual, assertOperationalAccess: mocks.assertAccess };
});
vi.mock("@/modules/shared/infrastructure/transactional-records", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>(),
  appendAuditEntry: mocks.appendAudit,
  appendOutboxEvent: mocks.appendOutbox,
  assertIdempotencyPayload: mocks.assertPayload,
  findOutboxEvent: mocks.findEvent,
  lockCommand: mocks.lock,
}));

import {
  enrollmentPriceAssignments,
  memberLocationScopes,
  organizationMembers,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { assignEnrollmentPriceInTransaction } from "@/modules/enrollments/application/enrollment-price-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const actor = {
  userId: "10000000-0000-4000-8000-000000000004",
  memberId: "10000000-0000-4000-8000-000000000005",
};
const assignmentId = "10000000-0000-4000-8000-000000000006";
const enrollmentId = "10000000-0000-4000-8000-000000000007";
const pricePlanId = "10000000-0000-4000-8000-000000000008";
const idempotencyKey = "enrollment-price-replay-001";
const dialect = new PgDialect();
let member: { id: string; userId: string; organizationId: string; status: string; role: string; locationScopeMode: string };

function makeTransaction(assignmentLocationId = locationId) {
  member = {
    id: actor.memberId,
    userId: actor.userId,
    organizationId,
    status: "active",
    role: "owner",
    locationScopeMode: "selected",
  };
  const assignment = {
    id: assignmentId,
    organizationId,
    locationId: assignmentLocationId,
    enrollmentId,
    pricePlanId,
    startsOn: "2026-10-01",
    endsOn: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
  };
  const select = vi.fn(() => {
    let table: unknown;
    let params: unknown[] = [];
    const query = {
      from: (value: unknown) => { table = value; return query; },
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        params = dialect.sqlToQuery(clause).params;
        return query;
      },
      limit: async () => {
        if (table === organizationMembers) {
          const matches = member.id === actor.memberId
            && member.userId === actor.userId
            && member.organizationId === organizationId
            && member.status === "active"
            && [organizationId, actor.userId, actor.memberId, "active"].every(value => params.includes(value));
          return matches ? [member] : [];
        }
        if (table === memberLocationScopes) {
          return [organizationId, member.id, locationId].every(value => params.includes(value))
            ? [{ id: "synthetic-location-scope" }]
            : [];
        }
        return table === enrollmentPriceAssignments ? [assignment] : [];
      },
    };
    return query;
  });
  const write = vi.fn(() => { throw new Error("El replay no debe escribir"); });
  const execute = vi.fn(async () => ({ rows: [] }));
  const tx = { select, execute, insert: write, update: write, delete: write } as unknown as TransactionClient;
  return { tx, write, execute, assignment };
}

function replay(tx: TransactionClient) {
  return assignEnrollmentPriceInTransaction(tx, {
    organizationId,
    locationId,
    enrollmentId,
    pricePlanId,
    startsOn: "2026-10-01",
    actor,
    idempotencyKey,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lock.mockResolvedValue(undefined);
  mocks.findEvent.mockResolvedValue({
    payload: { enrollmentId, pricePlanId, startsOn: "2026-10-01", assignmentId },
  });
  mocks.assertPayload.mockImplementation(() => undefined);
});

describe("replay de asignación de tarifa en solo lectura", () => {
  it("devuelve la asignación existente con autorización real y sin escrituras", async () => {
    const { tx, write, execute, assignment } = makeTransaction();

    await expect(replay(tx)).resolves.toEqual(assignment);

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("deniega el replay a un rol no autorizado", async () => {
    const { tx, write } = makeTransaction();
    member.role = "coach";

    await expect(replay(tx)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("deniega el replay si el miembro perdió el alcance de la sede", async () => {
    const { tx, write } = makeTransaction("10000000-0000-4000-8000-000000000099");

    await expect(replay(tx)).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("deniega el replay a una membresía inactiva", async () => {
    const { tx, write } = makeTransaction();
    member.status = "inactive";

    await expect(replay(tx)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });
});
