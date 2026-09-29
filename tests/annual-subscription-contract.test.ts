import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";

const read = (path: string) => readFileSync(path, "utf8");

describe("annual subscription contract", () => {
  it("keeps the canonical annual amounts at two months free", () => {
    expect(PRODUCT_PLAN_BY_CODE.pro.annualPriceEurCents).toBe(19_000);
    expect(PRODUCT_PLAN_BY_CODE.premium.annualPriceEurCents).toBe(49_000);
  });

  it("selects a separate annual Stripe Price and records the interval", () => {
    const source = read("src/app/api/billing/checkout/route.ts");
    expect(source).toContain('z.enum(["month", "year"]).default("month")');
    expect(source).toContain("plan?.stripeAnnualPriceId");
    expect(source).toContain("billingInterval: body.billingInterval");
    expect(source).toContain("PLAN_ANNUAL_PRICE_NOT_CONFIGURED");
  });

  it("keeps Stripe dynamic payment methods enabled", () => {
    const source = read("src/app/api/billing/checkout/route.ts");
    const sharedService = read("src/lib/stripe/checkout-service.ts");
    expect(source).not.toContain("payment_method_types");
    expect(sharedService).not.toContain("payment_method_types");
  });

  it("matches webhook prices against monthly or annual plan prices", () => {
    const source = read("src/lib/stripe/plan-service.ts");
    const sync = read("src/lib/stripe/sync-plans.ts");
    expect(source).toContain("stripeAnnualPriceId");
    expect(sync).toContain('billingInterval === "year"');
    expect(sync).toContain("annualPriceEur");
  });
});
