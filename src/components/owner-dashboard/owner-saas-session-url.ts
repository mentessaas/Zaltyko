// Match the hosted destinations required by the current backend contract.
// This validates a navigation target, not a payment, session or Stripe mode.
function isHostedSessionUrl(value: unknown, origin: string): value is string {
  if (typeof value !== "string" || !/^https:\/\//i.test(value) || /[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.origin === origin && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

export function isCheckoutSessionUrl(value: unknown): value is string {
  return isHostedSessionUrl(value, "https://checkout.stripe.com");
}

export function isPortalSessionUrl(value: unknown): value is string {
  return isHostedSessionUrl(value, "https://billing.stripe.com");
}
