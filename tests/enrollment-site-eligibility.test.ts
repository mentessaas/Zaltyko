import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TransactionClient } from "@/lib/db-transactions";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lockCommand: vi.fn(),
  findOutboxEvent: vi.fn(),
  assertIdempotencyPayload: vi.fn(),
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
  lockCapacity: vi.fn(),
  assertOperationalAccess: vi.fn(),
  assertOrganizationOperationalWritable: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  lockCommand: mocks.lockCommand,
  findOutboxEvent: mocks.findOutboxEvent,
  assertIdempotencyPayload: mocks.assertIdempotencyPayload,
  appendAuditEntry: mocks.appendAuditEntry,
  appendOutboxEvent: mocks.appendOutboxEvent,
  lockCapacity: mocks.lockCapacity,
}));
vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: mocks.assertOperationalAccess,
}));
vi.mock("@/modules/saas-billing/application/organization-usage", () => ({
  assertOrganizationOperationalWritable: mocks.assertOrganizationOperationalWritable,
}));

import { athletes } from "@/db/zaltyko-schema";
import { createEnrollmentInTransaction } from "@/modules/enrollments/application/enrollment-service";

const organizationId = "70000000-0000-4000-8000-000000000001";
const locationId = "70000000-0000-4000-8000-000000000002";
const athleteId = "70000000-0000-4000-8000-000000000003";
const classTemplateId = "70000000-0000-4000-8000-000000000004";
const actor = {
  userId: "70000000-0000-4000-8000-000000000005",
  memberId: "70000000-0000-4000-8000-000000000006",
};

describe("alta directa de inscripción y elegibilidad por sede", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOutboxEvent.mockResolvedValue(null);
    mocks.assertOperationalAccess.mockResolvedValue(undefined);
  });

  it("rechaza un atleta sin relación abierta en la sede antes de escribir", async () => {
    let selectedTable: unknown;
    let athleteWhere: Parameters<PgDialect["sqlToQuery"]>[0] | undefined;
    const select = vi.fn(() => {
      const query = {
        from(table: unknown) {
          selectedTable = table;
          return query;
        },
        where(clause: Parameters<PgDialect["sqlToQuery"]>[0]) {
          athleteWhere = clause;
          return query;
        },
        limit: async () => {
          if (selectedTable === athletes) return [];
          throw new Error("Selección inesperada");
        },
      };
      return query;
    });
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const insert = vi.fn();
    const update = vi.fn();
    const deleteRecords = vi.fn();
    const tx = {
      select,
      execute,
      insert,
      update,
      delete: deleteRecords,
    } as unknown as TransactionClient;

    await expect(
      createEnrollmentInTransaction(tx, {
        organizationId,
        locationId,
        athleteId,
        classTemplateId,
        startsOn: "2026-10-24",
        status: "pending",
        source: "owner",
        pricePlanId: null,
        idempotencyKey: "site-eligibility-denial",
        actor,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    expect(athleteWhere).toBeDefined();
    const compiled = new PgDialect().sqlToQuery(athleteWhere!);
    expect(compiled.sql).toContain("eligible_membership.athlete_id");
    expect(compiled.sql).toContain("eligible_group.location_id in");
    expect(compiled.sql).toContain("eligible_group.status = 'active'");
    expect(compiled.sql).toContain("eligible_enrollment.location_id in");
    expect(compiled.params).toEqual(
      expect.arrayContaining([organizationId, locationId, athleteId])
    );
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(deleteRecords).not.toHaveBeenCalled();
    expect(mocks.appendAuditEntry).not.toHaveBeenCalled();
    expect(mocks.appendOutboxEvent).not.toHaveBeenCalled();
  });
});
