import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertAccess: vi.fn(),
  assertSystemScope: vi.fn(),
  assertWritable: vi.fn(),
  lock: vi.fn(),
  assertPayload: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: mocks.assertAccess,
  assertSystemOperationalScope: mocks.assertSystemScope,
}));
vi.mock("@/modules/saas-billing/application/organization-usage", () => ({
  assertOrganizationOperationalWritable: mocks.assertWritable,
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
  assertIdempotencyPayload: mocks.assertPayload,
  lockCommand: mocks.lock,
}));

import { insightRuleRuns } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { runInsightEvaluation } from "@/modules/insights/application/insight-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const authorizationLocationId = "10000000-0000-4000-8000-000000000002";
const targetLocationId = "10000000-0000-4000-8000-000000000003";
const actor = {
  userId: "10000000-0000-4000-8000-000000000004",
  memberId: "10000000-0000-4000-8000-000000000005",
};
const idempotencyKey = "insight-evaluation-001";
const result = {
  runId: "10000000-0000-4000-8000-000000000006",
  created: 0,
  reopened: 0,
  refreshed: 0,
  suppressed: 0,
  resolved: 0,
  observedInsightIds: [],
};
let rows: unknown[];
let writes: ReturnType<typeof vi.fn>;
let execute: ReturnType<typeof vi.fn>;

function makeTransaction() {
  const select = vi.fn(() => {
    let table: unknown;
    const query = {
      from: (value: unknown) => { table = value; return query; },
      where: () => query,
      limit: async () => table === insightRuleRuns ? rows : [],
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
    authorizationLocationId,
    targetLocationId,
    ruleKey: "capacity-alert",
    ruleVersion: 1,
    evaluatedAt: "2026-10-23T10:00:00.000Z",
    sourceWatermark: "2026-10-23T09:59:00.000Z",
    idempotencyKey,
    candidates: [],
    actor,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [{ result }];
  mocks.assertAccess.mockResolvedValue(undefined);
  mocks.assertSystemScope.mockResolvedValue(undefined);
  mocks.assertPayload.mockImplementation(() => undefined);
  mocks.lock.mockResolvedValue(undefined);
});

describe("replay de evaluación de insights con academia en solo lectura", () => {
  it("mantiene ambos scopes humanos y devuelve el resultado sin write gate", async () => {
    makeTransaction();

    await expect(runInsightEvaluation(command())).resolves.toEqual(result);

    expect(mocks.assertAccess).toHaveBeenCalledTimes(2);
    expect(mocks.assertAccess).toHaveBeenNthCalledWith(1, expect.anything(), {
      organizationId,
      locationId: authorizationLocationId,
      actor,
      allowedRoles: ["owner", "admin"],
    });
    expect(mocks.assertAccess).toHaveBeenNthCalledWith(2, expect.anything(), {
      organizationId,
      locationId: targetLocationId,
      actor,
      allowedRoles: ["owner", "admin"],
    });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("bloquea una evaluación nueva antes de insertar en solo lectura", async () => {
    const tx = makeTransaction();
    rows = [];
    mocks.assertWritable.mockRejectedValue(
      new OperationalError("PLAN_OVER_CAPACITY", "Solo lectura", 409)
    );

    await expect(runInsightEvaluation(command())).rejects.toMatchObject({
      code: "PLAN_OVER_CAPACITY",
      status: 409,
    });

    expect(mocks.assertWritable).toHaveBeenCalledWith(tx, organizationId);
    expect(writes).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
