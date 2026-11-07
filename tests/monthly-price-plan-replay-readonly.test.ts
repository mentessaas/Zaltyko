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
  locations,
  memberLocationScopes,
  organizationMembers,
  organizations,
  outboxEvents,
  pricePlanClassTemplateCoverage,
  pricePlans,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { createMonthlyPricePlan } from "@/modules/billing/application/monthly-price-plan-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const actor = {
  userId: "10000000-0000-4000-8000-000000000004",
  memberId: "10000000-0000-4000-8000-000000000005",
};
const classTemplateId = "10000000-0000-4000-8000-000000000006";
const pricePlanId = "10000000-0000-4000-8000-000000000007";
const coverageId = "10000000-0000-4000-8000-000000000008";
const idempotencyKey = "monthly-price-replay-001";
const dialect = new PgDialect();
let member: { id: string; userId: string; organizationId: string; status: string; role: string; locationScopeMode: string };

function makeTransaction() {
  let locationScopeAvailable = true;
  member = {
    id: actor.memberId,
    userId: actor.userId,
    organizationId,
    status: "active",
    role: "owner",
    locationScopeMode: "selected",
  };
  const location = { id: locationId, organizationId, isActive: true };
  const organization = { id: organizationId, defaultCurrency: "EUR" };
  const pricePlan = { id: pricePlanId, organizationId, name: "Cuota mensual", amountCents: 2400, currency: "EUR", cadence: "monthly", isActive: true };
  const coverage = { cursorId: coverageId, classTemplateId, startsOn: "2026-10-01", endsOn: null };
  const canonicalCoverage = [{ classTemplateId, startsOn: "2026-10-01", endsOn: null }];
  const event = {
    payload: {
      pricePlanId,
      locationId,
      planLabel: "Cuota mensual",
      amountCents: 2400,
      currency: "EUR",
      cadence: "monthly",
      isActive: true,
      coverageFingerprint: JSON.stringify(canonicalCoverage),
    },
  };
  const rows = new Map<unknown, unknown[]>([
    [locations, [location]],
    [organizations, [organization]],
    [outboxEvents, [event]],
    [pricePlans, [pricePlan]],
    [pricePlanClassTemplateCoverage, [coverage]],
  ]);
  const select = vi.fn(() => {
    let table: unknown;
    let params: unknown[] = [];
    const query = {
      from: (value: unknown) => { table = value; return query; },
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        params = dialect.sqlToQuery(clause).params;
        return query;
      },
      orderBy: () => query,
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
          return locationScopeAvailable
            && [organizationId, member.id, locationId].every(value => params.includes(value))
            ? [{ id: "synthetic-location-scope" }]
            : [];
        }
        if (table === pricePlanClassTemplateCoverage && params.includes(coverageId)) return [];
        return rows.get(table) ?? [];
      },
    };
    return query;
  });
  const write = vi.fn(() => { throw new Error("El replay no debe escribir"); });
  const execute = vi.fn(async () => ({ rows: [] }));
  const tx = { select, execute, insert: write, update: write, delete: write } as unknown as TransactionClient;
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return {
    tx,
    write,
    execute,
    pricePlan,
    canonicalCoverage,
    denyLocationScope: () => { locationScopeAvailable = false; },
    setMemberRole: (role: string) => { member.role = role; },
    setMemberStatus: (status: string) => { member.status = status; },
  };
}

function replay(tx: TransactionClient) {
  return createMonthlyPricePlan({
    organizationId,
    locationId,
    name: "Cuota mensual",
    amountCents: 2400,
    currency: "EUR",
    coverage: { classTemplateIds: [classTemplateId], startsOn: "2026-10-01", endsOn: null },
    idempotencyKey,
    actor,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lock.mockResolvedValue(undefined);
  mocks.assertPayload.mockImplementation(() => undefined);
});

describe("replay de tarifa mensual en solo lectura", () => {
  it("recupera la tarifa existente con autorización real y sin escrituras", async () => {
    const { tx, write, execute, pricePlan, canonicalCoverage } = makeTransaction();

    await expect(replay(tx)).resolves.toEqual({ pricePlan, coverage: canonicalCoverage, replayed: true });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("deniega el replay si el miembro no tiene acceso a la sede", async () => {
    const { tx, write, denyLocationScope } = makeTransaction();
    denyLocationScope();

    await expect(replay(tx)).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("deniega el replay a un rol que no puede crear tarifas", async () => {
    const { tx, write, execute, setMemberRole } = makeTransaction();
    setMemberRole("coach");

    await expect(replay(tx)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("deniega el replay a una membresía inactiva", async () => {
    const { tx, write, execute, setMemberStatus } = makeTransaction();
    setMemberStatus("inactive");

    await expect(replay(tx)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.assertAccess).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });
});
