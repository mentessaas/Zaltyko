import { describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

import { PgDialect } from "drizzle-orm/pg-core";
import type { TransactionClient } from "@/lib/db-transactions";
import { resolveEffectiveOrganizationEntitlement } from "@/modules/saas-billing/application/entitlement-service";

const organizationId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-10-19T12:00:00.000Z");
const end = "2026-10-26T12:00:00.000Z";

function row(overrides: Record<string, unknown> = {}) {
  return {
    plan_code: "free",
    source: "bootstrap",
    revision: 1,
    effective_from: "2026-10-01T00:00:00.000Z",
    effective_until: null,
    subscription_id: null,
    trial_id: null,
    joined_trial_id: null,
    trial_status: null,
    trial_ends_at: null,
    joined_subscription_id: null,
    subscription_plan_code: null,
    subscription_provider_status: null,
    subscription_period_ends_at: null,
    ...overrides,
  };
}

function trial(overrides: Record<string, unknown> = {}) {
  return row({
    plan_code: "starter",
    source: "trial",
    trial_id: "trial-1",
    joined_trial_id: "trial-1",
    trial_status: "active",
    trial_ends_at: end,
    effective_until: end,
    ...overrides,
  });
}

function paid(overrides: Record<string, unknown> = {}) {
  return row({
    plan_code: "growth",
    source: "stripe_subscription",
    subscription_id: "sub-1",
    joined_subscription_id: "sub-1",
    subscription_plan_code: "growth",
    subscription_provider_status: "active",
    subscription_period_ends_at: end,
    effective_until: end,
    ...overrides,
  });
}

async function resolve(value: Record<string, unknown> | null, at = now) {
  const execute = vi.fn(
    async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const rendered = new PgDialect().sqlToQuery(query);
      expect(rendered.params).toEqual([organizationId]);
      expect(rendered.sql).toContain("t.organization_id = e.organization_id");
      expect(rendered.sql).toContain("s.organization_id = e.organization_id");
      return { rows: value ? [value] : [] };
    }
  );
  return resolveEffectiveOrganizationEntitlement(
    { execute } as unknown as TransactionClient,
    organizationId,
    at
  );
}

describe("effective canonical SaaS entitlement (mocked DB, real resolver)", () => {
  it.each([null, 0, -1, 1.5, "invalid", Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid entitlement revision %s",
    async (revision) => {
      await expect(resolve(row({ revision }))).rejects.toMatchObject({
        code: "FEATURE_NOT_AVAILABLE",
      });
    }
  );

  it.each([
    [row(), "free", 30],
    [trial(), "starter", 75],
    [paid(), "growth", 200],
    [row({ plan_code: "network", source: "contract" }), "network", null],
  ])("resolves valid entitlement %#", async (value, plan, limit) => {
    const result = await resolve(value as Record<string, unknown>);
    expect(result.planCode).toBe(plan);
    expect(result.limits.athleteLimit).toBe(limit);
  });

  it.each([
    trial(),
    paid(),
    row({ plan_code: "network", source: "contract", effective_until: end }),
  ])("expires at the exclusive end boundary %#", async (value) => {
    const result = await resolve(value, new Date(end));
    expect(result.planCode).toBe("free");
    expect(result.limits.athleteLimit).toBe(30);
  });

  it("does not grant a future entitlement", async () => {
    expect((await resolve(paid({ effective_from: end }))).planCode).toBe(
      "free"
    );
  });

  it.each(["past_due", "canceled"])(
    "preserves the paid window for %s",
    async (status) => {
      expect(
        (await resolve(paid({ subscription_provider_status: status }))).planCode
      ).toBe("growth");
    }
  );

  it.each(["incomplete", "incomplete_expired", "trialing"])(
    "does not grant paid access from provider state %s without a paid right",
    async (status) => {
      const result = await resolve(paid({ subscription_provider_status: status }));
      expect(result.planCode).toBe("free");
      expect(result.limits.athleteLimit).toBe(30);
    }
  );

  it.each([
    trial({ effective_until: null }),
    trial({ joined_trial_id: "other" }),
    trial({ trial_status: "revoked" }),
    trial({ trial_ends_at: "invalid" }),
    paid({ joined_subscription_id: "other" }),
    paid({ subscription_plan_code: "starter" }),
    paid({ subscription_provider_status: "unknown" }),
    paid({ effective_until: null }),
    row({ plan_code: "growth" }),
    row({ effective_from: "invalid" }),
    row({ source: "unknown" }),
    row({ plan_code: null }),
  ])(
    "fails closed for inconsistent source/reference/date %#",
    async (value) => {
      await expect(resolve(value)).rejects.toMatchObject({
        code: "FEATURE_NOT_AVAILABLE",
      });
    }
  );

  it("rejects a missing organization", async () => {
    await expect(resolve(null)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an invalid evaluation clock", async () => {
    await expect(resolve(row(), new Date(NaN))).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
    });
  });
});
