import { describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

import type { TransactionClient } from "@/lib/db-transactions";
import { grantOrganizationEntitlement } from "@/modules/saas-billing/application/entitlement-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const at = new Date("2026-10-20T12:00:00.000Z");

function inMemoryEntitlementTransaction(initialRevision = 1) {
  let current = {
    organizationId,
    planCode: "free",
    revision: initialRevision,
    source: "bootstrap",
    sourceReference: "bootstrap:free",
    subscriptionId: null,
    trialId: null,
    effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
    effectiveUntil: null,
    createdAt: at,
    updatedAt: at,
  };
  const updates: Array<Record<string, unknown>> = [];
  const history: Array<Record<string, unknown>> = [];

  const tx = {
    select: () => {
      const query = {
        from: () => query,
        where: () => query,
        for: () => query,
        limit: async () => [current],
      };
      return query;
    },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return {
          where: () => ({
            returning: async () => {
              current = {
                ...current,
                ...values,
                revision: current.revision + 1,
              } as typeof current;
              return [current];
            },
          }),
        };
      },
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        history.push(values);
      },
    }),
  } as unknown as TransactionClient;

  return {
    tx,
    updates,
    history,
    get current() {
      return current;
    },
  };
}

describe("canonical SaaS entitlement grants", () => {
  it("increments revision and snapshots the granted trial in one transaction", async () => {
    const memory = inMemoryEntitlementTransaction();
    const grant = {
      organizationId,
      planCode: "starter" as const,
      source: "trial" as const,
      sourceReference: "saas-trial:trial-1",
      subscriptionId: null,
      trialId: "trial-1",
      effectiveFrom: at,
      effectiveUntil: new Date("2026-10-27T12:00:00.000Z"),
    };

    const result = await grantOrganizationEntitlement(memory.tx, grant);

    expect(result).toEqual({ revision: 2, replayed: false });
    expect(memory.updates).toHaveLength(1);
    expect(memory.updates[0]).toHaveProperty("revision");
    expect(memory.current).toMatchObject({
      revision: 2,
      planCode: "starter",
      source: "trial",
      sourceReference: "saas-trial:trial-1",
      trialId: "trial-1",
    });
    expect(memory.history).toEqual([
      expect.objectContaining({
        organizationId,
        revision: 2,
        planCode: "starter",
        source: "trial",
        sourceReference: "saas-trial:trial-1",
        trialId: "trial-1",
      }),
    ]);
  });

  it("does not increment or duplicate history when the same paid invoice grant is replayed", async () => {
    const memory = inMemoryEntitlementTransaction(2);
    const grant = {
      organizationId,
      planCode: "growth" as const,
      source: "stripe_subscription" as const,
      sourceReference: "stripe-invoice:in_test_1",
      subscriptionId: "20000000-0000-4000-8000-000000000002",
      trialId: null,
      effectiveFrom: at,
      effectiveUntil: new Date("2026-11-20T12:00:00.000Z"),
    };

    const first = await grantOrganizationEntitlement(memory.tx, grant);
    const replay = await grantOrganizationEntitlement(memory.tx, grant);

    expect(first).toEqual({ revision: 3, replayed: false });
    expect(replay).toEqual({ revision: 3, replayed: true });
    expect(memory.updates).toHaveLength(1);
    expect(memory.history).toHaveLength(1);
    expect(memory.history[0]).toMatchObject({
      organizationId,
      revision: 3,
      planCode: "growth",
      source: "stripe_subscription",
      sourceReference: "stripe-invoice:in_test_1",
      subscriptionId: "20000000-0000-4000-8000-000000000002",
      trialId: null,
    });
  });

  it("rejects a replay whose source reference matches but grant payload differs", async () => {
    const memory = inMemoryEntitlementTransaction(3);
    const grant = {
      organizationId,
      planCode: "growth" as const,
      source: "stripe_subscription" as const,
      sourceReference: "stripe-invoice:in_test_1",
      subscriptionId: "20000000-0000-4000-8000-000000000002",
      trialId: null,
      effectiveFrom: at,
      effectiveUntil: new Date("2026-11-20T12:00:00.000Z"),
    };
    Object.assign(memory.current, {
      planCode: "starter",
      source: grant.source,
      sourceReference: grant.sourceReference,
      subscriptionId: grant.subscriptionId,
      trialId: null,
      effectiveFrom: grant.effectiveFrom,
      effectiveUntil: grant.effectiveUntil,
    });

    await expect(grantOrganizationEntitlement(memory.tx, grant)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });

    expect(memory.current.revision).toBe(3);
    expect(memory.updates).toHaveLength(0);
    expect(memory.history).toHaveLength(0);
  });
});
