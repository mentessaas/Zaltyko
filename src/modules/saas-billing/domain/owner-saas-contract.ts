/** Shared JSON response contracts. No server imports; clients still validate JSON. */
export type OwnerSaasPlanCode = "free" | "starter" | "growth" | "network";
export type OwnerSaasBillingInterval = "month" | "year";

export interface OwnerSaasBillingSnapshot {
  organization: { id: string; name: string };
  entitlement: {
    planCode: OwnerSaasPlanCode;
    source: string;
    revision: number;
    effectiveFrom: string;
    effectiveUntil: string | null;
  };
  limits: {
    maxAthletes: number | null;
    maxGroups: number | null;
    maxClasses: number | null;
    maxAcademies: number | null;
  };
  trial: {
    eligible: boolean;
    startsAt: string | null;
    endsAt: string | null;
    nextEligibleAt: string | null;
  };
  subscription: {
    status: string;
    billingInterval: OwnerSaasBillingInterval | null;
    currentPeriodEndsAt: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  /** Unknown synchronization states fail closed in the UI. */
  syncStatus: string;
  actions: {
    canStartTrial: boolean;
    canCheckoutStarter: boolean;
    canCheckoutGrowth: boolean;
    canOpenPortal: boolean;
  };
}

export interface OwnerSaasCheckoutResult {
  operationId: string;
  checkoutUrl: string;
  expiresAt: string;
  status: "pending";
}

export interface OwnerSaasPortalResult {
  portalUrl: string;
}

export interface OwnerSaasTrialResult {
  trialId: string;
  startsAt: string;
  endsAt: string;
  planCode: "starter";
  entitlementRevision: number;
}
