import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {},
}));

import { evaluateLimit, getUpgradeInfo } from "@/lib/limits";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";

describe("Límites por plan", () => {
  it("bloquea al alcanzar el límite de 30 gimnastas en Gratis", () => {
    const evaluation = evaluateLimit("free", 30, 30, "athletes");
    expect(evaluation.exceeded).toBe(true);
    expect(evaluation.upgradeTo).toBe("club");
  });

  it("Gratis no limita grupos ni clases", () => {
    expect(evaluateLimit("free", null, 500, "groups").exceeded).toBe(false);
    expect(evaluateLimit("free", null, 500, "classes").exceeded).toBe(false);
  });

  it("Club no limita gimnastas, grupos ni clases", () => {
    expect(evaluateLimit("club", null, 5000, "athletes").exceeded).toBe(false);
    expect(evaluateLimit("club", null, 500, "groups").exceeded).toBe(false);
    expect(evaluateLimit("club", null, 500, "classes").exceeded).toBe(false);
  });

  it("las suscripciones anteriores conservan derechos de Club", () => {
    const evaluation = evaluateLimit("pro", null, 5000, "athletes");
    expect(evaluation.exceeded).toBe(false);
    expect(evaluateLimit("premium", null, 5000, "athletes").exceeded).toBe(false);
  });

  it("limita la oferta a una academia por organización", () => {
    expect(PRODUCT_PLAN_BY_CODE.free.academyLimit).toBe(1);
    expect(PRODUCT_PLAN_BY_CODE.club.academyLimit).toBe(1);
  });

  it("publica Gratis y Club y conserva como heredados los códigos anteriores", () => {
    expect(PRODUCT_PLAN_BY_CODE.free.publicName).toBe("Gratis");
    expect(PRODUCT_PLAN_BY_CODE.free.athleteLimit).toBe(30);
    expect(PRODUCT_PLAN_BY_CODE.free.teamMemberLimit).toBe(2);
    expect(PRODUCT_PLAN_BY_CODE.free.groupLimit).toBeNull();
    expect(PRODUCT_PLAN_BY_CODE.free.classLimit).toBeNull();
    expect(PRODUCT_PLAN_BY_CODE.club.publicName).toBe("Club");
    expect(PRODUCT_PLAN_BY_CODE.club.priceEurCents).toBe(2397);
    expect(PRODUCT_PLAN_BY_CODE.club.athleteLimit).toBeNull();
    expect(PRODUCT_PLAN_BY_CODE.pro.publicName).toBe("Club (heredado)");
    expect(PRODUCT_PLAN_BY_CODE.pro.priceEurCents).toBe(1900);
    expect(PRODUCT_PLAN_BY_CODE.pro.athleteLimit).toBeNull();
    expect(PRODUCT_PLAN_BY_CODE.premium.publicName).toBe("Club (heredado)");
    expect(PRODUCT_PLAN_BY_CODE.premium.priceEurCents).toBe(4900);
    expect(PRODUCT_PLAN_BY_CODE.premium.athleteLimit).toBeNull();
    expect(PRODUCT_PLAN_BY_CODE.network.publicName).toBe("Club (heredado)");
    expect(PRODUCT_PLAN_BY_CODE.network.priceEurCents).toBe(9900);
    expect(PRODUCT_PLAN_BY_CODE.network.checkoutMode).toBe("included");
  });

  it("sube de Gratis a Club sin ofrecer varias academias por separado", () => {
    const upgrade = getUpgradeInfo("free");
    expect(upgrade.nextPlan).toBe("club");
    expect(upgrade.benefits.join(" ")).not.toMatch(/academias ilimitadas/i);
  });
});
