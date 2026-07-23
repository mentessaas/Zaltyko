import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { evaluateLimit, getUpgradeInfo } from "@/lib/limits";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";
import { getLimitForRoute, RATE_LIMITS } from "@/lib/rate-limit";
import { isFeatureEnabled } from "@/lib/product/features";

describe("API limits and feature contracts", () => {
  it("blocks the next athlete when Free is at its limit", () => {
    expect(evaluateLimit("free", 30, 30, "athletes")).toMatchObject({
      exceeded: true,
      upgradeTo: "pro",
    });
  });

  it("allows the final Starter athlete below the limit", () => {
    expect(evaluateLimit("pro", 75, 74, "athletes").exceeded).toBe(false);
  });

  it("blocks Growth once the configured athlete limit is reached", () => {
    expect(evaluateLimit("premium", 200, 200, "athletes").exceeded).toBe(true);
  });

  it("keeps Network unlimited only where the catalog says null", () => {
    expect(PRODUCT_PLAN_BY_CODE.network.athleteLimit).toBeNull();
    expect(PRODUCT_PLAN_BY_CODE.network.academyLimit).toBeNull();
  });

  it("uses the approved pricing v3 plan mapping", () => {
    expect(PRODUCT_PLAN_BY_CODE.free.publicName).toBe("Free");
    expect(PRODUCT_PLAN_BY_CODE.pro).toMatchObject({
      publicName: "Starter",
      priceEurCents: 1900,
    });
    expect(PRODUCT_PLAN_BY_CODE.premium).toMatchObject({
      publicName: "Growth",
      priceEurCents: 4900,
    });
  });

  it("does not promise unlimited academies in the Free upgrade", () => {
    const upgrade = getUpgradeInfo("free");
    expect(upgrade.nextPlan).toBe("pro");
    expect(upgrade.benefits.join(" ")).not.toMatch(/academias ilimitadas/i);
  });

  it("applies strict route budgets to billing and imports", () => {
    expect(getLimitForRoute("/api/billing/checkout")).toEqual({
      limit: 10,
      window: 60,
    });
    expect(getLimitForRoute("/api/athletes/import")).toEqual({
      limit: 5,
      window: 60,
    });
  });

  it("keeps webhook capacity separate from user mutations", () => {
    expect(getLimitForRoute("/api/stripe/webhook")).toEqual({
      limit: 1000,
      window: 60,
    });
    expect(RATE_LIMITS.CRITICAL.limit).toBeLessThan(RATE_LIMITS.WEBHOOK.limit);
  });

  it("fails closed on feature surfaces intentionally disabled in v1", () => {
    expect(isFeatureEnabled("paymentMethods")).toBe(false);
    expect(isFeatureEnabled("communicationTemplateUse")).toBe(false);
  });

  it("checks athlete limits before inserting a new athlete", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/athletes/route.ts"),
      "utf8"
    );
    expect(route.indexOf("assertWithinPlanLimits")).toBeLessThan(
      route.indexOf("tx.insert(athletes)")
    );
  });

  it("checks class limits before inserting a class", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/classes/route.ts"),
      "utf8"
    );
    expect(route.indexOf("assertWithinPlanLimits")).toBeLessThan(
      route.indexOf("db.insert(classes)")
    );
  });

  it("fails closed in production when KV is unavailable", () => {
    const rateLimit = readFileSync(
      join(process.cwd(), "src/lib/rate-limit.ts"),
      "utf8"
    );
    expect(rateLimit).toContain('process.env.NODE_ENV === "production"');
    expect(rateLimit).toContain("success: false");
    expect(rateLimit).toContain(
      "Rate limiting unavailable: Vercel KV is not configured"
    );
  });
});
