import { describe, expect, it } from "vitest";

import {
  CommercialInterviewInputSchema,
  PublicGrowthEventSchema,
  toCommercialPlanSlug,
} from "@/lib/growth/contracts";
import { getSafeRate } from "@/lib/growth/dashboard";
import { createAcademyFingerprint, toCommercialInterviewValues } from "@/lib/growth/interviews";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";

const eventId = "2ec2ad6e-9df5-457d-ab49-57c0c94ae44e";
const visitorId = "f799cdf2-f7f2-43d8-8fa3-dff0a89411cb";

describe("Phase 4 commercial validation contracts", () => {
  it("keeps the public growth endpoint on a small PII-free allowlist", () => {
    expect(
      PublicGrowthEventSchema.safeParse({
        eventId,
        eventName: "pricing_plan_selected",
        visitorId,
        planCode: "starter",
        source: "public_pricing",
        properties: { utm_source: "newsletter", path: "/pricing" },
      }).success
    ).toBe(true);

    expect(
      PublicGrowthEventSchema.safeParse({
        eventId,
        eventName: "subscription_activated",
        visitorId,
        source: "public_pricing",
        properties: {},
      }).success
    ).toBe(false);

    expect(
      PublicGrowthEventSchema.safeParse({
        eventId,
        eventName: "pricing_viewed",
        visitorId,
        source: "public_pricing",
        properties: { email: "persona@example.com" },
      }).success
    ).toBe(false);
  });

  it("does not count a completed interview without the required evidence", () => {
    const result = CommercialInterviewInputSchema.safeParse({
      academyName: "Club Norte",
      status: "completed",
      locationCount: 1,
      betaInterest: "unknown",
      willingnessToPay: "unknown",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining([
          "athleteCount",
          "currentTools",
          "biggestPain",
          "primaryObjection",
          "easyPriceEur",
          "limitPriceEur",
          "completedAt",
        ])
      );
    }
  });

  it("accepts and normalizes a completed evidence-backed interview", () => {
    const parsed = CommercialInterviewInputSchema.parse({
      academyName: "Club Norte",
      countryCode: "es",
      city: "Madrid",
      modality: "artistica",
      athleteCount: 82,
      coachCount: 6,
      locationCount: 1,
      currentTools: "Excel y WhatsApp",
      biggestPain: "Conciliar cuotas",
      mostValuableFeature: "Cobros recurrentes",
      primaryObjection: "Migración de datos",
      easyPriceEur: 19,
      limitPriceEur: 39,
      betaInterest: "yes",
      willingnessToPay: "yes",
      status: "completed",
      completedAt: "2026-07-13T10:00:00.000Z",
    });
    const values = toCommercialInterviewValues(parsed);

    expect(values.countryCode).toBe("ES");
    expect(values.easyPriceEurCents).toBe(1_900);
    expect(values.limitPriceEurCents).toBe(3_900);
  });

  it("deduplicates the same academy despite casing and accents", () => {
    const first = createAcademyFingerprint({
      academyName: "Gimnasia Élite",
      countryCode: "ES",
      city: "Málaga",
    });
    const duplicate = createAcademyFingerprint({
      academyName: " gimnasia elite ",
      countryCode: "es",
      city: "malaga",
    });
    const otherCity = createAcademyFingerprint({
      academyName: "Gimnasia Élite",
      countryCode: "ES",
      city: "Sevilla",
    });

    expect(first).toBe(duplicate);
    expect(first).not.toBe(otherCity);
  });

  it("keeps pricing v3 and plan attribution aligned", () => {
    expect(PRODUCT_PLAN_BY_CODE.free.priceEurCents).toBe(0);
    expect(PRODUCT_PLAN_BY_CODE.free.athleteLimit).toBe(30);
    expect(PRODUCT_PLAN_BY_CODE.pro.priceEurCents).toBe(1_900);
    expect(PRODUCT_PLAN_BY_CODE.pro.athleteLimit).toBe(75);
    expect(PRODUCT_PLAN_BY_CODE.pro.groupLimit).toBe(5);
    expect(PRODUCT_PLAN_BY_CODE.pro.classLimit).toBe(20);
    expect(PRODUCT_PLAN_BY_CODE.pro.cta).toBe("Solicitar demo");
    expect(PRODUCT_PLAN_BY_CODE.premium.priceEurCents).toBe(4_900);
    expect(PRODUCT_PLAN_BY_CODE.premium.athleteLimit).toBe(200);
    expect(PRODUCT_PLAN_BY_CODE.premium.groupLimit).toBe(10);
    expect(PRODUCT_PLAN_BY_CODE.premium.classLimit).toBe(40);
    expect(PRODUCT_PLAN_BY_CODE.network.checkoutMode).toBe("sales-assisted");
    expect(toCommercialPlanSlug("pro")).toBe("starter");
    expect(toCommercialPlanSlug("premium")).toBe("growth");
  });

  it("never reports a conversion percentage without a denominator", () => {
    expect(getSafeRate(0, 0)).toBeNull();
    expect(getSafeRate(2, 5)).toBe(40);
  });
});
