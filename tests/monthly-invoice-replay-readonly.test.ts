import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertAccess: vi.fn(),
  assertWritable: vi.fn(),
  lock: vi.fn(),
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
vi.mock("@/modules/shared/infrastructure/transactional-records", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>(),
  appendAuditEntry: mocks.appendAudit,
  appendOutboxEvent: mocks.appendOutbox,
  assertIdempotencyPayload: mocks.assertPayload,
  lockCommand: mocks.lock,
}));

import {
  charges,
  familyMembers,
  invoiceLines,
  invoices,
  locations,
  memberLocationScopes,
  organizationMembers,
  outboxEvents,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { calendarDueDateToUtc } from "@/modules/billing/domain/calendar-due-date";
import { issueMonthlyInvoice } from "@/modules/billing/application/monthly-invoice-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const familyId = "10000000-0000-4000-8000-000000000003";
const familyPayerId = "10000000-0000-4000-8000-000000000004";
const invoiceId = "10000000-0000-4000-8000-000000000005";
const chargeId = "10000000-0000-4000-8000-000000000006";
const actor = {
  userId: "10000000-0000-4000-8000-000000000007",
  memberId: "10000000-0000-4000-8000-000000000008",
};
const idempotencyKey = "monthly-invoice-replay-001";
const servicePeriod = "2026-10";
const dueDate = "2026-10-31";
const quoteHash = "a".repeat(64);
const dialect = new PgDialect();
let member: { id: string; userId: string; organizationId: string; status: string; role: string; locationScopeMode: string };

function makeTransaction(invoiceLocationId = locationId) {
  member = {
    id: actor.memberId,
    userId: actor.userId,
    organizationId,
    status: "active",
    role: "owner",
    locationScopeMode: "selected",
  };
  const invoice = {
    id: invoiceId,
    organizationId,
    locationId: invoiceLocationId,
    familyId,
    familyPayerId,
    totalAmountCents: 2400,
    currency: "EUR",
    status: "open",
    voidedAt: null,
  };
  const charge = {
    id: chargeId,
    organizationId,
    invoiceId,
    status: "due",
    collectionMode: "manual",
  };
  const event = {
    payload: {
      invoiceId,
      familyId,
      familyPayerId,
      locationId,
      servicePeriod,
      dueAt: calendarDueDateToUtc(dueDate, "Europe/Madrid"),
      quoteHash,
    },
  };
  const rows = new Map<unknown, unknown[]>([
    [locations, [{ id: locationId, timezone: "Europe/Madrid", isActive: true }]],
    [familyMembers, []],
    [outboxEvents, [event]],
    [charges, [charge]],
    [invoices, [invoice]],
    [invoiceLines, []],
  ]);
  const select = vi.fn(() => {
    let table: unknown;
    let params: unknown[] = [];
    const query = {
      from: (value: unknown) => { table = value; return query; },
      leftJoin: () => query,
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        params = dialect.sqlToQuery(clause).params;
        return query;
      },
      orderBy: () => query,
      limit: () => query,
      for: () => query,
      then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(readRows()).then(resolve, reject),
    };
    function readRows() {
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
      return rows.get(table) ?? [];
    }
    return query;
  });
  const write = vi.fn(() => { throw new Error("El replay no debe escribir"); });
  const execute = vi.fn(async (_statement: Parameters<PgDialect["sqlToQuery"]>[0]) => ({ rows: [{ id: locationId }] }));
  const tx = { select, execute, insert: write, update: write, delete: write } as unknown as TransactionClient;
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return {
    tx,
    write,
    execute,
    invoice,
    charge,
    setMemberRole: (role: string) => { member.role = role; },
  };
}

function issueReplay() {
  return issueMonthlyInvoice({
    organizationId,
    locationId,
    servicePeriod,
    familyId,
    familyPayerId,
    dueDate,
    quoteHash,
    idempotencyKey,
    actor,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lock.mockResolvedValue(undefined);
  mocks.assertPayload.mockImplementation(() => undefined);
});

describe("replay de factura mensual en solo lectura", () => {
  it("recupera el resultado anterior con ambas comprobaciones de acceso y sin DML", async () => {
    const { write, execute, invoice, charge } = makeTransaction();

    await expect(issueReplay()).resolves.toEqual({
      invoice,
      chargeStatus: "due",
      collectionMode: "manual",
      charges: [{ id: charge.id, status: "due" }],
      replayed: true,
      lines: [],
    });

    expect(mocks.assertAccess).toHaveBeenCalledTimes(2);
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
    for (const [statement] of execute.mock.calls) {
      const query = dialect.sqlToQuery(statement).sql.trim();
      expect(query).toMatch(/^select\b/i);
    }
  });

  it("deniega el replay a un rol que no puede emitir facturas", async () => {
    const { write, execute, setMemberRole } = makeTransaction();
    setMemberRole("coach");

    await expect(issueReplay()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("deniega el replay si el miembro no tiene alcance en la sede", async () => {
    const { write, execute } = makeTransaction("10000000-0000-4000-8000-000000000099");

    await expect(issueReplay()).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledTimes(2);
    for (const [statement] of execute.mock.calls) {
      const query = dialect.sqlToQuery(statement).sql.trim();
      expect(query).toMatch(/^select\b/i);
    }
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });
});
