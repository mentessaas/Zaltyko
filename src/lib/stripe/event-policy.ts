export const BILLING_EVENT_PROCESSING_LEASE_MS = 5 * 60 * 1000;

export function canRetryBillingEvent(params: {
  status: string;
  lastAttemptAt: Date | null;
  now: Date;
}) {
  if (params.status === "error") return true;
  return (
    params.status === "processing" &&
    (!params.lastAttemptAt ||
      params.now.getTime() - params.lastAttemptAt.getTime() >= BILLING_EVENT_PROCESSING_LEASE_MS)
  );
}

export function shouldApplyStripeEvent(lastAppliedAt: Date | null, incomingAt: Date) {
  return !lastAppliedAt || lastAppliedAt.getTime() <= incomingAt.getTime();
}
