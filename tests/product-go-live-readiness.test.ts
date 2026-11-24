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

  it("publishes Gratis and Club while retaining legacy access at its old price", () => {
    expect(PRODUCT_PLAN_BY_CODE.free.publicName).toBe("Gratis");
    expect(PRODUCT_PLAN_BY_CODE.free.athleteLimit).toBe(30);
    expect(PRODUCT_PLAN_BY_CODE.free.teamMemberLimit).toBe(2);
    expect(PRODUCT_PLAN_BY_CODE.club.publicName).toBe("Club");
    expect(PRODUCT_PLAN_BY_CODE.club.priceEurCents).toBe(2397);
    expect(PRODUCT_PLAN_BY_CODE.club.annualPriceEurCents).toBe(23967);
    expect(PRODUCT_PLAN_BY_CODE.pro.publicName).toBe("Club (heredado)");
    expect(PRODUCT_PLAN_BY_CODE.pro.academyLimit).toBe(1);
    expect(PRODUCT_PLAN_BY_CODE.pro.priceEurCents).toBe(1900);
    expect(PRODUCT_PLAN_BY_CODE.pro.athleteLimit).toBeNull();
    expect(PRODUCT_PLAN_BY_CODE.premium.publicName).toBe("Club (heredado)");
    expect(PRODUCT_PLAN_BY_CODE.premium.academyLimit).toBe(1);
    expect(PRODUCT_PLAN_BY_CODE.premium.priceEurCents).toBe(4900);
  });

  it("hides Network from new sales and keeps its old code only for existing accounts", () => {
    expect(PRODUCT_PLAN_BY_CODE.network.publicName).toBe("Club (heredado)");
    expect(PRODUCT_PLAN_BY_CODE.network.checkoutMode).toBe("included");
    expect(PRODUCT_PLAN_BY_CODE.network.features.join(" ")).toMatch(/histórico oculto/i);
  });

  it("enforces Gratis limits and points upgrades to Club", () => {
    expect(PRODUCT_PLAN_BY_CODE.free.athleteLimit).toBe(30);
    expect(PRODUCT_PLAN_BY_CODE.free.groupLimit).toBeNull();
    expect(PRODUCT_PLAN_BY_CODE.free.classLimit).toBeNull();

    expect(evaluateLimit("free", 30, 30, "athletes")).toMatchObject({
      exceeded: true,
      upgradeTo: "club",
    });
    expect(evaluateLimit("free", null, 1000, "groups").exceeded).toBe(false);
    expect(evaluateLimit("club", null, 5000, "athletes").exceeded).toBe(false);

    const freeUpgrade = getUpgradeInfo("free");
    expect(freeUpgrade.nextPlan).toBe("club");
    expect(freeUpgrade.price).toBe("29€/mes IVA incluido");
    expect(freeUpgrade.benefits.join(" ")).not.toMatch(/academias ilimitadas/i);
  });
});
