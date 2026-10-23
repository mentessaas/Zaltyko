import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertAccess: vi.fn(),
  assertWritable: vi.fn(),
  lock: vi.fn(),
  findEvent: vi.fn(),
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
  return {
    ...actual,
    appendAuditEntry: mocks.appendAudit,
    appendOutboxEvent: mocks.appendOutbox,
    findOutboxEvent: mocks.findEvent,
    lockCommand: mocks.lock,
  };
});

import {
  classTemplates,
  memberLocationScopes,
  organizationMembers,
  sessions,
  type Session,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { materializeSessions } from "@/modules/scheduling/application/session-service";

const organizationId = "40000000-0000-4000-8000-000000000001";
const locationId = "40000000-0000-4000-8000-000000000002";
const classTemplateId = "40000000-0000-4000-8000-000000000003";
const sessionIdA = "40000000-0000-4000-8000-000000000004";
const sessionIdB = "40000000-0000-4000-8000-000000000005";
const userId = "40000000-0000-4000-8000-000000000006";
const memberId = "40000000-0000-4000-8000-000000000007";
const actor = { userId, memberId };
const idempotencyKey = "sessions-materialize-001";
const startDate = "2026-10-24";
const endDate = "2026-10-31";
const eventName = "sessions.materialized";
const dialect = new PgDialect();
const template = {
  id: classTemplateId,
  locationId,
  status: "active",
  effectiveFrom: "2026-10-01",
  effectiveTo: null,
};
const sessionRows = [
  {
    id: sessionIdA,
    organizationId,
    locationId,
    classTemplateId,
    startsAt: new Date("2026-10-24T09:00:00.000Z"),
    endsAt: new Date("2026-10-24T10:00:00.000Z"),
  },
  {
    id: sessionIdB,
    organizationId,
    locationId,
    classTemplateId,
    startsAt: new Date("2026-10-31T09:00:00.000Z"),
    endsAt: new Date("2026-10-31T10:00:00.000Z"),
  },
] as unknown as Session[];
const command = {
  organizationId,
  classTemplateId,
  startDate,
  endDate,
  idempotencyKey,
  actor,
};
type PriorEvent = {
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
};
let memberRole: string;
let locationScopeMode: string;
let scopeAllowed: boolean;
let currentEvent: PriorEvent | null;
let rows: Session[];
let orderingSql: string;
let requestedLimit: number | undefined;
let writes: ReturnType<typeof vi.fn>;
let execute: ReturnType<typeof vi.fn>;
let tx: TransactionClient;

function eventFor(payload: Record<string, unknown> = {}): PriorEvent {
  return {
    aggregateType: "class_template",
    aggregateId: classTemplateId,
    payload: {
      classTemplateId,
      startDate,
      endDate,
      sessionIds: [sessionIdA, sessionIdB],
      sessionCount: 2,
      ...payload,
    },
  };
}

function run(input = command) {
  return materializeSessions(input, tx);
}

function expectNoWrites() {
  expect(writes).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
  expect(mocks.appendAudit).not.toHaveBeenCalled();
  expect(mocks.appendOutbox).not.toHaveBeenCalled();
}

function makeTransaction() {
  const select = vi.fn(() => {
    let table: unknown;
    let params: unknown[] = [];
    const query = {
      from: (value: unknown) => { table = value; return query; },
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        params = dialect.sqlToQuery(clause).params;
        return query;
      },
      orderBy: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        orderingSql = dialect.sqlToQuery(clause).sql.toLowerCase().replaceAll('"', "");
        return query;
      },
      limit: async (limit: number) => {
        requestedLimit = limit;
        if (table === classTemplates) {
          return [organizationId, classTemplateId].every(value => params.includes(value))
            ? [template]
            : [];
        }
        if (table === organizationMembers) {
          return [organizationId, userId, memberId, "active"].every(value => params.includes(value))
            ? [{
                id: memberId,
                userId,
                organizationId,
                status: "active",
                role: memberRole,
                locationScopeMode,
              }]
            : [];
        }
        if (table === memberLocationScopes) {
          return scopeAllowed && [organizationId, memberId, locationId].every(value => params.includes(value))
            ? [{ id: "synthetic-location-scope" }]
            : [];
        }
        if (table === sessions) {
          const matchingRows = rows.filter(row =>
            params.includes(row.organizationId) && params.includes(row.id)
          );
          if (orderingSql.includes("starts_at") && orderingSql.includes("asc")) {
            matchingRows.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
          }
          return matchingRows.slice(0, limit);
        }
        throw new Error("Consulta inesperada en replay de materialización de sesiones");
      },
    };
    return query;
  });
  writes = vi.fn(() => { throw new Error("El replay no debe escribir"); });
  execute = vi.fn(() => { throw new Error("El replay no debe ejecutar SQL"); });
  tx = { select, execute, insert: writes, update: writes, delete: writes } as unknown as TransactionClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  memberRole = "owner";
  locationScopeMode = "selected";
  scopeAllowed = true;
  currentEvent = eventFor();
  rows = [...sessionRows].reverse();
  orderingSql = "";
  requestedLimit = undefined;
  mocks.lock.mockResolvedValue(undefined);
  mocks.assertWritable.mockRejectedValue(
    Object.assign(new Error("Academia de solo lectura"), {
      code: "PLAN_OVER_CAPACITY",
      status: 409,
    })
  );
  mocks.findEvent.mockImplementation(async (_tx, input) =>
    currentEvent
    && input.organizationId === organizationId
    && input.eventName === eventName
    && input.idempotencyKey === idempotencyKey
      ? currentEvent
      : null
  );
  makeTransaction();
});

describe("replay de materialización de sesiones en solo lectura", () => {
  it("recupera sesiones confirmadas con autorización de lectura y sin DML", async () => {
    await expect(run()).resolves.toEqual(sessionRows);

    expect(mocks.assertAccess).toHaveBeenCalledWith(tx, {
      organizationId,
      locationId,
      actor,
      allowedRoles: ["owner", "manager", "admin"],
    });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expect(orderingSql).toMatch(/starts_at\s+asc/);
    expect(requestedLimit).toBe(1000);
    expectNoWrites();
  });

  it("acepta la misma plantilla UUID aunque el casing de entrada difiera del agregado de PostgreSQL", async () => {
    const uppercaseTemplateId = classTemplateId.toUpperCase();
    currentEvent = eventFor({ classTemplateId: uppercaseTemplateId });

    await expect(run({ ...command, classTemplateId: uppercaseTemplateId })).resolves.toEqual(sessionRows);

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("mantiene el guard de escritura cuando no existe un evento previo", async () => {
    currentEvent = null;

    await expect(run()).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });

    expect(mocks.assertAccess).toHaveBeenCalledWith(tx, {
      organizationId,
      locationId,
      actor,
      allowedRoles: ["owner", "manager", "admin"],
    });
    expect(mocks.findEvent).toHaveBeenCalledOnce();
    expect(mocks.assertWritable).toHaveBeenCalledOnce();
    expect(mocks.findEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.assertWritable.mock.invocationCallOrder[0]!
    );
    expectNoWrites();
  });

  it.each([
    "aggregateType",
    "aggregateId",
    "invalidAggregateId",
    "sessionCount",
    "invalidSessionId",
    "duplicateSessionId",
  ] as const)(
    "rechaza resultado previo incoherente: %s",
    async issue => {
      if (issue === "aggregateType") currentEvent = { ...eventFor(), aggregateType: "attendance" };
      if (issue === "aggregateId") currentEvent = { ...eventFor(), aggregateId: sessionIdA };
      if (issue === "invalidAggregateId") currentEvent = { ...eventFor(), aggregateId: "not-a-uuid" };
      if (issue === "sessionCount") currentEvent = eventFor({ sessionCount: 1 });
      if (issue === "invalidSessionId") currentEvent = eventFor({ sessionIds: ["not-a-uuid"] });
      if (issue === "duplicateSessionId") currentEvent = eventFor({ sessionIds: [sessionIdA, sessionIdA], sessionCount: 2 });

      await expect(run()).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

      expect(mocks.assertWritable).not.toHaveBeenCalled();
      expectNoWrites();
    }
  );

  it.each(["other-template", "other-location", "missing-session"] as const)(
    "rechaza sesiones persistidas incoherentes: %s",
    async issue => {
      if (issue === "other-template") rows = [
        { ...sessionRows[0]!, classTemplateId: sessionIdB },
        sessionRows[1]!,
      ];
      if (issue === "other-location") rows = [
        { ...sessionRows[0]!, locationId: sessionIdB },
        sessionRows[1]!,
      ];
      if (issue === "missing-session") rows = [sessionRows[0]!];

      await expect(run()).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

      expect(mocks.assertWritable).not.toHaveBeenCalled();
      expectNoWrites();
    }
  );

  it("sigue denegando el replay a roles no autorizados y fuera del alcance de sede", async () => {
    memberRole = "coach";
    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();

    memberRole = "owner";
    scopeAllowed = false;
    await expect(run()).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });
});
