import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isFeatureEnabled, type ProductFeatureKey } from "@/lib/product/features";
import { evaluateLimit, getUpgradeInfo } from "@/lib/limits";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";

const gatedFeatures: ProductFeatureKey[] = [
  "advancedAnalytics",
  "reportsHub",
  "scheduledReports",
  "leakProfitability",
  "whatsapp",
  "paymentMethods",
  "communicationTemplateUse",
];

const featureEnvVars = [
  "NEXT_PUBLIC_FEATURE_ADVANCED_ANALYTICS",
  "NEXT_PUBLIC_FEATURE_REPORTS_HUB",
  "NEXT_PUBLIC_FEATURE_SCHEDULED_REPORTS",
  "NEXT_PUBLIC_FEATURE_LEAK_PROFITABILITY",
  "NEXT_PUBLIC_FEATURE_WHATSAPP",
  "NEXT_PUBLIC_FEATURE_PAYMENT_METHODS",
  "NEXT_PUBLIC_FEATURE_TEMPLATE_USE",
];

describe("Go-live product guardrails", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const envName of featureEnvVars) {
      delete process.env[envName];
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("keeps immature modules disabled by default", () => {
    for (const feature of gatedFeatures) {
      expect(isFeatureEnabled(feature)).toBe(false);
    }
  });

  it("keeps Starter and Growth single-academy for v1", () => {
    expect(PRODUCT_PLAN_BY_CODE.starter.publicName).toBe("Starter");
    expect(PRODUCT_PLAN_BY_CODE.starter.academyLimit).toBe(1);
    expect(PRODUCT_PLAN_BY_CODE.starter.features.join(" ")).not.toMatch(/academias ilimitadas/i);
    expect(PRODUCT_PLAN_BY_CODE.pro.publicName).toBe("Growth");
    expect(PRODUCT_PLAN_BY_CODE.pro.academyLimit).toBe(1);
    expect(PRODUCT_PLAN_BY_CODE.pro.features.join(" ")).not.toMatch(/academias ilimitadas/i);
  });

  it("positions Network as accompanied multi-site, not self-serve unlimited", () => {
    expect(PRODUCT_PLAN_BY_CODE.premium.publicName).toBe("Network");
    expect(PRODUCT_PLAN_BY_CODE.premium.cta).toMatch(/hablar con zaltyko/i);
    expect(PRODUCT_PLAN_BY_CODE.premium.academyLimit).toBeNull();
  });

  it("enforces pricing v3 capacity limits in executable go-live coverage", () => {
    expect(PRODUCT_PLAN_BY_CODE.free.athleteLimit).toBe(30);
    expect(PRODUCT_PLAN_BY_CODE.starter.athleteLimit).toBe(75);
    expect(PRODUCT_PLAN_BY_CODE.pro.athleteLimit).toBe(200);
    expect(PRODUCT_PLAN_BY_CODE.premium.athleteLimit).toBeNull();

    expect(evaluateLimit("free", 30, 30, "athletes")).toMatchObject({
      exceeded: true,
      upgradeTo: "pro",
    });
    expect(evaluateLimit("pro", 200, 199, "athletes").exceeded).toBe(false);
    expect(evaluateLimit("premium", null, 5000, "athletes").exceeded).toBe(false);

    const freeUpgrade = getUpgradeInfo("free");
    expect(freeUpgrade.nextPlan).toBe("pro");
    expect(freeUpgrade.benefits.join(" ")).not.toMatch(/academias ilimitadas/i);
  });
});
