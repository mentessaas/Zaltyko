import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertAccess: vi.fn(),
  assertWritable: vi.fn(),
  lock: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: mocks.assertAccess,
}));
vi.mock("@/modules/saas-billing/application/organization-usage", () => ({
  assertOrganizationOperationalWritable: mocks.assertWritable,
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: mocks.appendAudit,
  appendOutboxEvent: mocks.appendOutbox,
  lockCommand: mocks.lock,
}));

import {
  auditLog,
  benchmarkMetricTargets,
  benchmarkProfiles,
  locations,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { saveAcademyTargetProfile } from "@/modules/health-score/application/academy-target-profile";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const actor = {
  userId: "10000000-0000-4000-8000-000000000003",
  memberId: "10000000-0000-4000-8000-000000000004",
};
const profileId = "10000000-0000-4000-8000-000000000005";
const targets = {
  class_fill_rate: 0.8,
  cohort_retention_rate: 0.75,
  churn_rate: 0.2,
  collection_rate: 0.9,
  attendance_coverage: 0.85,
};
const targetRows = Object.entries(targets).map(([metricKey, value]) => ({
  metricKey,
  value: String(value),
  currency: metricKey === "collection_rate" ? "EUR" : null,
}));
let rows: Map<unknown, unknown[]>;
let writes: ReturnType<typeof vi.fn>;
let execute: ReturnType<typeof vi.fn>;

function makeTransaction() {
  const select = vi.fn(() => {
    let table: unknown;
    const query = {
      from: (value: unknown) => { table = value; return query; },
      where: () => query,
      orderBy: () => query,
      limit: async () => rows.get(table) ?? [],
    };
    return query;
  });
  writes = vi.fn(() => { throw new Error("Unexpected DML"); });
  execute = vi.fn(() => { throw new Error("Unexpected direct SQL in read-only scenario"); });
  const tx = {
    select,
    execute,
    insert: writes,
    update: writes,
    delete: writes,
  } as unknown as TransactionClient;
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  return tx;
}

function command() {
  return {
    organizationId,
    authorizationLocationId: locationId,
    actor,
    targets,
    idempotencyKey: "targets-command-001",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = new Map([
    [locations, [{ id: locationId }]],
    [auditLog, [{ targetId: profileId }]],
    [benchmarkProfiles, [{ id: profileId, organizationId, key: "academy_internal_targets", currency: "EUR", version: 3 }]],
    [benchmarkMetricTargets, targetRows],
  ]);
  mocks.assertAccess.mockResolvedValue(undefined);
  mocks.lock.mockResolvedValue(undefined);
});

describe("replay de objetivos con academia en solo lectura", () => {
  it("recupera el perfil existente sin activar el gate de escritura", async () => {
    makeTransaction();

    await expect(saveAcademyTargetProfile(command())).resolves.toEqual({
      profileId,
      version: 3,
      replayed: true,
    });

    expect(mocks.assertAccess).toHaveBeenCalledWith(expect.anything(), {
      organizationId,
      locationId,
      actor,
      allowedRoles: ["owner", "admin"],
    });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("aplica el gate antes de DML cuando la clave aún no tiene resultado", async () => {
    const tx = makeTransaction();
    rows.set(auditLog, []);
    mocks.assertWritable.mockRejectedValue(
      new OperationalError("PLAN_OVER_CAPACITY", "Solo lectura", 409)
    );

    await expect(saveAcademyTargetProfile(command())).rejects.toMatchObject({
      code: "PLAN_OVER_CAPACITY",
      status: 409,
    });

    expect(mocks.assertWritable).toHaveBeenCalledWith(tx, organizationId);
    expect(writes).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });
});
