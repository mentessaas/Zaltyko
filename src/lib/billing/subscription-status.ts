const ACCESS_STATUSES = new Set(["active", "trialing", "past_due", "canceling"]);
const TERMINAL_STATUSES = new Set(["canceled", "cancelled", "incomplete_expired"]);

export function hasSubscriptionAccess(status: string | null | undefined) {
  return Boolean(status && ACCESS_STATUSES.has(status));
}

export function isSubscriptionManaged(params: {
  stripeSubscriptionId: string | null | undefined;
  status: string | null | undefined;
}) {
  return Boolean(
    params.stripeSubscriptionId &&
      (!params.status || !TERMINAL_STATUSES.has(params.status))
  );
}
