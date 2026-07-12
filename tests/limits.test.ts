import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {},
}));

import { evaluateLimit, getUpgradeInfo } from "@/lib/limits";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";

describe("Límites por plan", () => {
  it("bloquea al pasar de 30 atletas en plan Free", () => {
    const evaluation = evaluateLimit("free", 30, 30, "athletes");
    expect(evaluation.exceeded).toBe(true);
    expect(evaluation.upgradeTo).toBe("pro");
  });

  it("permite hasta 75 atletas en Starter", () => {
    const evaluation = evaluateLimit("pro", 75, 74, "athletes");
    expect(evaluation.exceeded).toBe(false);
  });

  it("permite hasta 200 atletas en Growth", () => {
    const evaluation = evaluateLimit("premium", 200, 199, "athletes");
    expect(evaluation.exceeded).toBe(false);
  });

  it("mantiene Free, Starter y Growth en una academia para v1 comercial", () => {
    expect(PRODUCT_PLAN_BY_CODE.free.academyLimit).toBe(1);
    expect(PRODUCT_PLAN_BY_CODE.pro.academyLimit).toBe(1);
    expect(PRODUCT_PLAN_BY_CODE.premium.academyLimit).toBe(1);
    expect(PRODUCT_PLAN_BY_CODE.network.academyLimit).toBeNull();
  });

  it("publica el catálogo v3 oficial en los códigos internos actuales", () => {
    expect(PRODUCT_PLAN_BY_CODE.free.publicName).toBe("Free");
    expect(PRODUCT_PLAN_BY_CODE.free.athleteLimit).toBe(30);
    expect(PRODUCT_PLAN_BY_CODE.pro.publicName).toBe("Starter");
    expect(PRODUCT_PLAN_BY_CODE.pro.priceEurCents).toBe(1900);
    expect(PRODUCT_PLAN_BY_CODE.pro.athleteLimit).toBe(75);
    expect(PRODUCT_PLAN_BY_CODE.premium.publicName).toBe("Growth");
    expect(PRODUCT_PLAN_BY_CODE.premium.priceEurCents).toBe(4900);
    expect(PRODUCT_PLAN_BY_CODE.premium.athleteLimit).toBe(200);
    expect(PRODUCT_PLAN_BY_CODE.network.publicName).toBe("Network");
    expect(PRODUCT_PLAN_BY_CODE.network.priceEurCents).toBe(9900);
    expect(PRODUCT_PLAN_BY_CODE.network.athleteLimit).toBeNull();
  });

  it("no promociona academias ilimitadas al subir de Free a Starter", () => {
    const upgrade = getUpgradeInfo("free");
    expect(upgrade.nextPlan).toBe("pro");
    expect(upgrade.benefits.join(" ")).not.toMatch(/academias ilimitadas/i);
  });
});
