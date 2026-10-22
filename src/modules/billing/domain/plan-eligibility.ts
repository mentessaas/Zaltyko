export type EntitlementPlanCode = "free" | "starter" | "growth" | "network";
export type EntitlementSource = "bootstrap" | "stripe_subscription" | "contract";

export interface EntitlementSnapshot {
  organizationId: string;
  planCode: EntitlementPlanCode;
  revision: number;
  source: EntitlementSource;
  sourceReference: string;
  subscriptionId: string | null;
  effectiveFrom: Date | string;
  effectiveUntil: Date | string | null;
}

export interface SaasSubscriptionProjection {
  id: string;
  organizationId: string;
  provider: "stripe";
  environment: "test" | "live";
  providerAccountReference: string;
  subscriptionReference: string;
  planCode: Exclude<EntitlementPlanCode, "free">;
  providerStatus:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "paused";
  currentPeriodStartedAt: Date | string;
  currentPeriodEndsAt: Date | string;
}

export type AutomaticPlanEligibilityReason =
  | "entitlement_missing"
  | "paid_plan_required"
  | "entitlement_not_effective"
  | "subscription_missing"
  | "subscription_mismatch"
  | "subscription_not_active"
  | "subscription_period_not_current";

export type AutomaticPlanEligibility =
  | { eligible: true; reason: null; entitlementRevision: number }
  | { eligible: false; reason: AutomaticPlanEligibilityReason };

function instant(value: Date | string | null): number | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Evaluates only server-loaded subscription and entitlement snapshots.
 * Entitlement windows are half-open: [effectiveFrom, effectiveUntil).
 */
export function evaluateAutomaticCollectionPlanEligibility(input: {
  organizationId: string;
  entitlement: EntitlementSnapshot | null;
  subscription: SaasSubscriptionProjection | null;
  now?: Date;
}): AutomaticPlanEligibility {
  const now = (input.now ?? new Date()).getTime();
  const entitlement = input.entitlement;
  if (!entitlement) return { eligible: false, reason: "entitlement_missing" };
  if (entitlement.organizationId !== input.organizationId) {
    return { eligible: false, reason: "entitlement_missing" };
  }
  if (entitlement.planCode === "free") {
    return { eligible: false, reason: "paid_plan_required" };
  }

  const effectiveFrom = instant(entitlement.effectiveFrom);
  const effectiveUntil = instant(entitlement.effectiveUntil);
  if (
    !Number.isInteger(entitlement.revision) ||
    entitlement.revision < 1 ||
    !entitlement.sourceReference.trim() ||
    effectiveFrom === null ||
    effectiveFrom > now ||
    (entitlement.effectiveUntil !== null &&
      (effectiveUntil === null || effectiveUntil <= now))
  ) {
    return { eligible: false, reason: "entitlement_not_effective" };
  }

  if (entitlement.source === "contract") {
    if (entitlement.subscriptionId !== null) {
      return { eligible: false, reason: "subscription_mismatch" };
    }
    return {
      eligible: true,
      reason: null,
      entitlementRevision: entitlement.revision,
    };
  }

  if (entitlement.source !== "stripe_subscription") {
    return { eligible: false, reason: "paid_plan_required" };
  }
  const subscription = input.subscription;
  if (!subscription) {
    return { eligible: false, reason: "subscription_missing" };
  }
  if (
    subscription.organizationId !== input.organizationId ||
    entitlement.subscriptionId !== subscription.id ||
    entitlement.planCode !== subscription.planCode ||
    !subscription.providerAccountReference.trim()
  ) {
    return { eligible: false, reason: "subscription_mismatch" };
  }
  if (subscription.providerStatus !== "active") {
    return { eligible: false, reason: "subscription_not_active" };
  }

  const periodStart = instant(subscription.currentPeriodStartedAt);
  const periodEnd = instant(subscription.currentPeriodEndsAt);
  if (
    periodStart === null ||
    periodEnd === null ||
    periodStart > now ||
    periodEnd <= now
  ) {
    return { eligible: false, reason: "subscription_period_not_current" };
  }
  return {
    eligible: true,
    reason: null,
    entitlementRevision: entitlement.revision,
  };
}
