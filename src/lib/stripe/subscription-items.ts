import type Stripe from "stripe";

export function getPrimarySubscriptionItemId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.id ?? null;
}

