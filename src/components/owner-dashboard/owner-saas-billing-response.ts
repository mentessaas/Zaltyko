import type { OwnerSaasBillingSnapshot } from "./owner-saas-billing-types";
import { isSaasTimestamp as timestamp } from "./owner-saas-timestamp";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || timestamp(value);
}

function limit(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

/** Validates the read contract, not access policy. Preserve server decisions. */
export function decodeOwnerSaasBillingSnapshot(
  payload: unknown,
  expectedOrganizationId: string,
): OwnerSaasBillingSnapshot | null {
  if (!record(payload) || payload.ok !== true || !record(payload.data)) return null;
  const data = payload.data;
  const { organization, entitlement, limits, trial, subscription, actions } = data;
  if (!record(organization) || !text(organization.id)
    || organization.id !== expectedOrganizationId || !text(organization.name)
    || !record(entitlement)
    || !(entitlement.planCode === "free" || entitlement.planCode === "starter"
      || entitlement.planCode === "growth" || entitlement.planCode === "network")
    || !text(entitlement.source)
    || typeof entitlement.revision !== "number" || !Number.isSafeInteger(entitlement.revision)
    || entitlement.revision < 1
    || !timestamp(entitlement.effectiveFrom) || !nullableTimestamp(entitlement.effectiveUntil)
    || !record(limits) || !limit(limits.maxAthletes) || !limit(limits.maxGroups)
    || !limit(limits.maxClasses) || !limit(limits.maxAcademies)
    || !record(trial) || typeof trial.eligible !== "boolean"
    || !nullableTimestamp(trial.startsAt) || !nullableTimestamp(trial.endsAt)
    || !nullableTimestamp(trial.nextEligibleAt)
    || !text(data.syncStatus) || !record(actions)
    || typeof actions.canStartTrial !== "boolean"
    || typeof actions.canCheckoutStarter !== "boolean"
    || typeof actions.canCheckoutGrowth !== "boolean"
    || typeof actions.canOpenPortal !== "boolean") return null;

  let checkedSubscription: OwnerSaasBillingSnapshot["subscription"] = null;
  if (subscription !== null) {
    if (!record(subscription) || !text(subscription.status)
      || !(subscription.billingInterval === "month" || subscription.billingInterval === "year"
        || subscription.billingInterval === null)
      || !timestamp(subscription.currentPeriodEndsAt)
      || typeof subscription.cancelAtPeriodEnd !== "boolean") return null;
    checkedSubscription = {
      status: subscription.status,
      billingInterval: subscription.billingInterval,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  }

  return {
    organization: { id: organization.id, name: organization.name },
    entitlement: {
      planCode: entitlement.planCode, source: entitlement.source, revision: entitlement.revision,
      effectiveFrom: entitlement.effectiveFrom, effectiveUntil: entitlement.effectiveUntil,
    },
    limits: {
      maxAthletes: limits.maxAthletes, maxGroups: limits.maxGroups,
      maxClasses: limits.maxClasses, maxAcademies: limits.maxAcademies,
    },
    trial: {
      eligible: trial.eligible, startsAt: trial.startsAt,
      endsAt: trial.endsAt, nextEligibleAt: trial.nextEligibleAt,
    },
    subscription: checkedSubscription,
    syncStatus: data.syncStatus,
    actions: {
      canStartTrial: actions.canStartTrial,
      canCheckoutStarter: actions.canCheckoutStarter,
      canCheckoutGrowth: actions.canCheckoutGrowth,
      canOpenPortal: actions.canOpenPortal,
    },
  };
}
