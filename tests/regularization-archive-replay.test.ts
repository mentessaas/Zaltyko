import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertOwnerScope: vi.fn(),
  lockOrganization: vi.fn(),
  lockCommand: vi.fn(),
  getUsage: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));
vi.mock("@/modules/saas-billing/application/owner-access", () => ({
  resolveSaasOwnerScope: mocks.assertOwnerScope,
}));
vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({
  lockOrganizationForSaasMutation: mocks.lockOrganization,
}));
vi.mock("@/modules/saas-billing/application/organization-usage", () => ({
  getOrganizationUsage: mocks.getUsage,
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: mocks.appendAudit,
  appendOutboxEvent: mocks.appendOutbox,
  lockCommand: mocks.lockCommand,
}));

import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { archiveResourceInTransaction } from "@/modules/saas-billing/application/regularization-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const resourceId = "ab000000-0000-4000-8000-000000000001";
const usage = {
  planCode: "free",
  readOnly: true,
  resources: [
    { resource: "athletes", current: 31, limit: 30, excess: 1 },
    { resource: "groups", current: 3, limit: 3, excess: 0 },
    { resource: "classes", current: 10, limit: 10, excess: 0 },
  ],
};
let execute: ReturnType<typeof vi.fn>;

function transactionFor(prior: unknown) {
  execute = vi.fn(async () => ({ rows: prior ? [prior] : [] }));
  return { execute } as unknown as TransactionClient;
}

function input(resourceIdValue = resourceId) {
  return {
    userId: "10000000-0000-4000-8000-000000000002",
    organizationId,
    resource: "athletes" as const,
    resourceId: resourceIdValue,
    idempotencyKey: "archive-command-001",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertOwnerScope.mockResolvedValue({ organizationId, memberId: "10000000-0000-4000-8000-000000000003" });
  mocks.lockOrganization.mockResolvedValue(undefined);
  mocks.lockCommand.mockResolvedValue(undefined);
  mocks.getUsage.mockResolvedValue(usage);
});

describe("replay de archivo para regularización", () => {
  it("acepta el mismo UUID aunque el cliente cambie mayúsculas", async () => {
    const tx = transactionFor({
      aggregate_id: resourceId,
      aggregate_type: "athletes",
      payload: { resource: "athletes", resourceId },
    });

    await expect(
      archiveResourceInTransaction(tx, input(resourceId.toUpperCase()))
    ).resolves.toBe(usage);

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.getUsage).toHaveBeenCalledWith(tx, organizationId);
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    "not-an-object",
    { resource: "groups", resourceId },
    { resource: "athletes", resourceId: "not-a-uuid" },
  ])(
    "rechaza como conflicto un payload previo inválido: %j",
    async (payload) => {
      const tx = transactionFor({ aggregate_id: resourceId, aggregate_type: "athletes", payload });

      await expect(
        archiveResourceInTransaction(tx, input())
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

      expect(execute).toHaveBeenCalledOnce();
      expect(mocks.getUsage).not.toHaveBeenCalled();
      expect(mocks.appendAudit).not.toHaveBeenCalled();
      expect(mocks.appendOutbox).not.toHaveBeenCalled();
    }
  );

  it("no permite reaprovechar la clave para otro recurso", async () => {
    const otherResourceId = "ab000000-0000-4000-8000-000000000002";
    const tx = transactionFor({
      aggregate_id: resourceId,
      aggregate_type: "athletes",
      payload: { resource: "athletes", resourceId },
    });

    await expect(
      archiveResourceInTransaction(tx, input(otherResourceId))
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("rechaza un evento previo vinculado a otro tipo de recurso", async () => {
    const tx = transactionFor({
      aggregate_id: resourceId,
      aggregate_type: "groups",
      payload: { resource: "athletes", resourceId },
    });

    await expect(
      archiveResourceInTransaction(tx, input())
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("rechaza un aggregate_id previo que no sea UUID", async () => {
    const tx = transactionFor({
      aggregate_id: "not-a-uuid",
      aggregate_type: "athletes",
      payload: { resource: "athletes", resourceId },
    });

    await expect(
      archiveResourceInTransaction(tx, input())
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("rechaza un resourceId inválido en el replay", async () => {
    const tx = transactionFor({
      aggregate_id: resourceId,
      aggregate_type: "athletes",
      payload: { resource: "athletes", resourceId },
    });

    await expect(
      archiveResourceInTransaction(tx, input("not-a-uuid"))
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });
});
