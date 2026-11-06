import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  transaction: vi.fn(),
  findOutboxEvent: vi.fn(),
  lockCommand: vi.fn(),
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
  observeQuery: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: () => "verified-synthetic-tenant",
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () =>
    new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.ownerScope,
}));
vi.mock("@/db", () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock(
  "@/modules/shared/infrastructure/transactional-records",
  async (importOriginal) => ({
    ...await importOriginal<
      typeof import("@/modules/shared/infrastructure/transactional-records")
    >(),
    findOutboxEvent: mocks.findOutboxEvent,
    lockCommand: mocks.lockCommand,
    lockGroupCapacity: mocks.lockCommand,
    lockCapacity: mocks.lockCommand,
    appendAuditEntry: mocks.appendAuditEntry,
    appendOutboxEvent: mocks.appendOutboxEvent,
  })
);
vi.mock("@/modules/groups/application/group-management-service", () => ({
  searchGroupAthleteOptions: vi.fn(),
}));

import { POST as addGroupMembership } from "@/app/api/v1/owner/groups/[groupId]/memberships/route";
import { POST as createEnrollment } from "@/app/api/v1/owner/enrollments/route";
import { POST as issueMonthlyInvoice } from "@/app/api/v1/owner/billing/monthly-invoices/issue/route";
import {
  groups,
  memberLocationScopes,
  organizationMembers,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";

const organizationId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000003";
const assignedLocationId = "10000000-0000-4000-8000-000000000004";
const outsideLocationId = "10000000-0000-4000-8000-000000000005";
const groupId = "10000000-0000-4000-8000-000000000006";
const athleteId = "10000000-0000-4000-8000-000000000007";
const classTemplateId = "10000000-0000-4000-8000-000000000008";
const familyId = "10000000-0000-4000-8000-000000000009";
const familyPayerId = "10000000-0000-4000-8000-000000000010";
const dialect = new PgDialect();
let expectedScopeLocationId = outsideLocationId;

function request(path: string, body: unknown, key: string) {
  return new Request(`https://zaltyko.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
}

function requireQueryFilters(
  tableName: string,
  params: unknown[],
  required: unknown[]
) {
  const missing = required.filter((value) => !params.includes(value));
  if (missing.length > 0) {
    throw new Error(`Synthetic ${tableName} query omitted required filters`);
  }
}

function makeTransaction() {
  const select = vi.fn(() => {
    let table: unknown;
    let params: unknown[] = [];
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      where(clause: Parameters<PgDialect["sqlToQuery"]>[0]) {
        params = dialect.sqlToQuery(clause).params;
        return query;
      },
      async limit() {
        mocks.observeQuery(table, [...params]);

        if (table === groups) {
          requireQueryFilters("groups", params, [organizationId, groupId]);
          return [{
            id: groupId,
            organizationId,
            locationId: outsideLocationId,
            capacity: 12,
            status: "active",
          }];
        }
        if (table === organizationMembers) {
          requireQueryFilters("organizationMembers", params, [
            organizationId,
            memberId,
            userId,
            "active",
          ]);
          return [{
            id: memberId,
            organizationId,
            userId,
            status: "active",
            role: "manager",
            locationScopeMode: "selected",
          }];
        }
        if (table === memberLocationScopes) {
          requireQueryFilters("memberLocationScopes", params, [
            organizationId,
            memberId,
            expectedScopeLocationId,
          ]);
          const siteFilters = [assignedLocationId, outsideLocationId].filter(
            (locationId) => params.includes(locationId)
          );
          if (siteFilters.length !== 1) {
            throw new Error(
              "Synthetic memberLocationScopes query must filter exactly one site"
            );
          }
          return siteFilters[0] === assignedLocationId
            ? [{ id: "10000000-0000-4000-8000-000000000011" }]
            : [];
        }
        return [];
      },
    };
    return query;
  });

  return {
    select,
    execute: mocks.execute,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  } as unknown as TransactionClient;
}

function expectObservedQuery(table: unknown, required: unknown[]) {
  expect(mocks.observeQuery).toHaveBeenCalledWith(
    table,
    expect.arrayContaining(required)
  );
}

// These spies cover only the synthetic command transaction. resolveOwnerScope
// is mocked here, so real access-audit behavior is outside this test.
function expectNoBusinessWritesInSyntheticTransaction() {
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.appendAuditEntry).not.toHaveBeenCalled();
  expect(mocks.appendOutboxEvent).not.toHaveBeenCalled();
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  expectedScopeLocationId = outsideLocationId;
  const tx = makeTransaction();

  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: {
      id: organizationId,
      name: "Academia sintética",
      defaultCurrency: "EUR",
    },
    member: {
      id: memberId,
      role: "manager",
      locationScopeMode: "selected",
    },
    locations: [{ id: assignedLocationId, name: "Sede asignada" }],
    selectedLocationId: assignedLocationId,
    canViewOrganizationAggregate: false,
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.findOutboxEvent.mockResolvedValue(null);
});

describe("Handlers invocados con scope simulado y servicios transaccionales reales", () => {
  it("rechaza pertenencia fuera de sede con LOCATION_SCOPE_DENIED y sin escritura", async () => {
    const response = await addGroupMembership(
      request(
        `/api/v1/owner/groups/${groupId}/memberships`,
        {
          organizationId,
          athleteId,
          startsOn: "2026-10-28",
          status: "active",
        },
        "manager-membership-outside-site"
      ),
      { params: Promise.resolve({ groupId }) }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      type: "https://zaltyko.com/problems/location-scope-denied",
      status: 403,
    });
    expect(mocks.ownerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
    });
    expectObservedQuery(groups, [organizationId, groupId]);
    expectObservedQuery(organizationMembers, [
      organizationId,
      memberId,
      userId,
      "active",
    ]);
    expectObservedQuery(memberLocationScopes, [
      organizationId,
      memberId,
      outsideLocationId,
    ]);
    expectNoBusinessWritesInSyntheticTransaction();
  });

  it("rechaza inscripción fuera de sede con LOCATION_SCOPE_DENIED y sin escritura", async () => {
    const response = await createEnrollment(
      request(
        "/api/v1/owner/enrollments",
        {
          organizationId,
          locationId: outsideLocationId,
          athleteId,
          classTemplateId,
          startsOn: "2026-10-28",
        },
        "manager-enrollment-outside-site"
      )
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      type: "https://zaltyko.com/problems/location-scope-denied",
      status: 403,
    });
    expect(mocks.ownerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId: outsideLocationId,
    });
    expectObservedQuery(organizationMembers, [
      organizationId,
      memberId,
      userId,
      "active",
    ]);
    expectObservedQuery(memberLocationScopes, [
      organizationId,
      memberId,
      outsideLocationId,
    ]);
    expectNoBusinessWritesInSyntheticTransaction();
  });

  it("deniega a Manager emitir factura mensual con FORBIDDEN y sin escritura", async () => {
    expectedScopeLocationId = assignedLocationId;
    const response = await issueMonthlyInvoice(
      request(
        "/api/v1/owner/billing/monthly-invoices/issue",
        {
          organizationId,
          locationId: assignedLocationId,
          familyId,
          familyPayerId,
          servicePeriod: "2026-10",
          dueDate: "2026-11-05",
          quoteHash: "a".repeat(64),
        },
        "manager-monthly-invoice-forbidden"
      )
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      type: "https://zaltyko.com/problems/forbidden",
      status: 403,
    });
    expect(mocks.ownerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId: assignedLocationId,
    });
    expectObservedQuery(organizationMembers, [
      organizationId,
      memberId,
      userId,
      "active",
    ]);
    expectNoBusinessWritesInSyntheticTransaction();
  });
});
