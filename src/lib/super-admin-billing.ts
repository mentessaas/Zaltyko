/**
 * Lifecycle vocabularies used by the global Billing control plane.
 * Invoice and subscription statuses come from different Stripe resources.
 */
export const RISKY_SUBSCRIPTION_STATUSES = ["past_due", "canceled", "unpaid"] as const;
export const RISKY_INVOICE_STATUSES = ["open", "uncollectible"] as const;

export function isRiskyBillingStatus(status: string | null | undefined) {
  return Boolean(
    status &&
      (RISKY_SUBSCRIPTION_STATUSES.includes(
        status as (typeof RISKY_SUBSCRIPTION_STATUSES)[number],
      ) ||
        RISKY_INVOICE_STATUSES.includes(
          status as (typeof RISKY_INVOICE_STATUSES)[number],
        )),
  );
}
