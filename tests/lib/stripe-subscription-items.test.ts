import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { getPrimarySubscriptionItemId } from "@/lib/stripe/subscription-items";

describe("getPrimarySubscriptionItemId", () => {
  it("returns the first subscription item id", () => {
    const subscription = {
      items: {
        data: [{ id: "si_123" }],
      },
    } as Stripe.Subscription;

    expect(getPrimarySubscriptionItemId(subscription)).toBe("si_123");
  });

  it("returns null when the subscription has no items", () => {
    const subscription = {
      items: {
        data: [],
      },
    } as unknown as Stripe.Subscription;

    expect(getPrimarySubscriptionItemId(subscription)).toBeNull();
  });
});

