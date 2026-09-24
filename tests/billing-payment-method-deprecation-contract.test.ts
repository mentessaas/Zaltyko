import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("billing payment method endpoint contract", () => {
  it("does not pretend to update a method and points owners to the real Stripe portal", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/billing/payment-method/route.ts"), "utf8");
    expect(source).toContain("USE_BILLING_PORTAL");
    expect(source).toContain("410");
    expect(source).not.toContain("TODO: Integrate with Stripe");
  });
});
