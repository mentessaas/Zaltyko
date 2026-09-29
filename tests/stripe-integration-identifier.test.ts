import { describe, expect, it } from "vitest";

import { createStripeIntegrationIdentifier } from "@/lib/stripe/integration-identifier";

describe("createStripeIntegrationIdentifier", () => {
  it("adds an eight-letter random suffix to the checkout flow name", () => {
    expect(createStripeIntegrationIdentifier("zaltyko_billing")).toMatch(
      /^zaltyko_billing_[a-z]{8}$/
    );
  });

  it("creates a distinct identifier for each checkout session", () => {
    expect(createStripeIntegrationIdentifier("zaltyko_billing")).not.toBe(
      createStripeIntegrationIdentifier("zaltyko_billing")
    );
  });
});
