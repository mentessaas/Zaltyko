import { hasSubscriptionAccess } from "@/lib/billing/subscription-status";

describe("hasSubscriptionAccess", () => {
  it("deniega active sin respaldo de Stripe", () => {
    expect(
      hasSubscriptionAccess({ stripeSubscriptionId: null, status: "active" })
    ).toBe(false);
  });

  it("concede active con stripe_subscription_id", () => {
    expect(
      hasSubscriptionAccess({ stripeSubscriptionId: "sub_123", status: "active" })
    ).toBe(true);
  });

  it("concede trialing con stripe_subscription_id", () => {
    expect(
      hasSubscriptionAccess({ stripeSubscriptionId: "sub_123", status: "trialing" })
    ).toBe(true);
  });

  it("deniega canceled aunque tenga stripe_subscription_id", () => {
    expect(
      hasSubscriptionAccess({ stripeSubscriptionId: "sub_123", status: "canceled" })
    ).toBe(false);
  });
});
