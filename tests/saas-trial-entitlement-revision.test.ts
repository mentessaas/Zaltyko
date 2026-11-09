import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  scope: vi.fn(),
  effective: vi.fn(),
  lock: vi.fn(),
  grant: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/env", () => ({
  getAppUrl: () => "https://example.invalid",
  getDatabaseUrl: () => "postgres://example.invalid",
}));
vi.mock("@/modules/saas-billing/application/owner-access", () => ({
  resolveSaasOwnerScope: mocks.scope,
}));
vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({
  grantOrganizationEntitlement: mocks.grant,
  lockOrganizationForSaasMutation: mocks.lock,
  resolveEffectiveOrganizationEntitlement: mocks.effective,
}));

import { startOwnerSaasTrial } from "@/modules/saas-billing/application/saas-billing-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const input = {
  organizationId,
  userId: "synthetic-owner",
  idempotencyKey: "trial-operation-001",
  at: new Date("2026-10-20T12:00:00.000Z"),
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.scope.mockResolvedValue({ organizationId, memberId: "member-1" });
  mocks.effective.mockResolvedValue({ planCode: "free", source: "bootstrap" });
  mocks.lock.mockResolvedValue(undefined);
  mocks.grant.mockResolvedValue({ revision: 2, replayed: false });
});

describe("Starter trial entitlement revision", () => {
  it("advances once and returns the existing revision when the same trial request is replayed", async () => {
    let selections: unknown[][] = [];
    let insertedTrial: Record<string, unknown> | null = null;
    const tx = {
      select: () => {
        const query = {
          from: () => query,
          where: () => query,
          orderBy: () => query,
          limit: async () => selections.shift() ?? [],
        };
        return query;
      },
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedTrial = { ...values, id: "trial-1" };
          return { returning: async () => [insertedTrial] };
        },
      }),
      update: vi.fn(),
    };
    mocks.transaction.mockImplementation((work) => work(tx));

    selections = [[], [], []];
    const first = await startOwnerSaasTrial(input);

    expect(first).toMatchObject({ trialId: "trial-1", entitlementRevision: 2, replayed: false });
    expect(mocks.grant).toHaveBeenCalledTimes(1);
    expect(mocks.grant).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId,
        planCode: "starter",
        source: "trial",
        sourceReference: "saas-trial:trial-1",
        trialId: "trial-1",
      })
    );

    selections = [[insertedTrial], [{ revision: 2 }]];
    const replay = await startOwnerSaasTrial(input);

    expect(replay).toMatchObject({ trialId: "trial-1", entitlementRevision: 2, replayed: true });
    expect(mocks.grant).toHaveBeenCalledTimes(1);
  });
});
