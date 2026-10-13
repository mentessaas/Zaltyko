import {
  evaluateCollectionEligibility,
  type CollectionEligibilityInput,
} from "@/modules/billing/domain/collection-eligibility";
import {
  evaluateAutomaticCollectionPlanEligibility,
  type EntitlementSnapshot,
  type SaasSubscriptionProjection,
} from "@/modules/billing/domain/plan-eligibility";

const now = new Date("2026-10-13T12:00:00.000Z");

function paidEntitlement(
  overrides: Partial<EntitlementSnapshot> = {}
): EntitlementSnapshot {
  return {
    organizationId: "org-a",
    planCode: "growth",
    revision: 4,
    source: "stripe_subscription",
    sourceReference: "evt_synthetic_004",
    subscriptionId: "sub-projection-a",
    effectiveFrom: "2026-10-01T12:00:00.000Z",
    effectiveUntil: "2026-11-13T12:00:00.000Z",
    ...overrides,
  };
}

function paidSubscription(
  overrides: Partial<SaasSubscriptionProjection> = {}
): SaasSubscriptionProjection {
  return {
    id: "sub-projection-a",
    organizationId: "org-a",
    provider: "stripe",
    environment: "test",
    providerAccountReference: "acct_synthetic",
    subscriptionReference: "sub_synthetic",
    planCode: "growth",
    providerStatus: "active",
    currentPeriodStartedAt: "2026-10-01T12:00:00.000Z",
    currentPeriodEndsAt: "2026-11-13T12:00:00.000Z",
    ...overrides,
  };
}

function eligibleInput(): CollectionEligibilityInput {
  return {
    organization: { id: "org-a", status: "active" },
    entitlement: paidEntitlement(),
    subscription: paidSubscription(),
    preference: {
      organizationId: "org-a",
      familyId: "family-a",
      requestedMode: "automatic",
      entitlementRevision: 4,
    },
    charge: {
      organizationId: "org-a",
      familyId: "family-a",
      familyPayerId: "payer-a",
      collectionMode: "automatic",
    },
    processorEnvironment: "test",
    providerAccount: {
      id: "provider-account-a",
      organizationId: "org-a",
      processor: "stripe",
      environment: "test",
      accountsApiGeneration: 2,
      chargeModel: "direct",
      status: "active",
      cardPaymentsCapabilityStatus: "active",
    },
    authorization: {
      organizationId: "org-a",
      familyId: "family-a",
      familyPayerId: "payer-a",
      paymentProviderAccountId: "provider-account-a",
      status: "active",
      consentVersion: "consent-v1",
      consentEvidenceReference: "synthetic-consent-object-ref",
      consentEvidenceSha256: "a".repeat(64),
      consentedAt: "2026-10-01T10:00:00.000Z",
      consentedByGuardianId: "guardian-a",
      validUntil: null,
      revokedAt: null,
    },
    runtimeEnabled: true,
    now,
  };
}

describe("SaaS automatic-collection entitlement", () => {
  it.each([
    ["missing entitlement", null, paidSubscription(), "entitlement_missing"],
    [
      "Free entitlement",
      paidEntitlement({
        planCode: "free",
        source: "bootstrap",
        subscriptionId: null,
      }),
      null,
      "paid_plan_required",
    ],
    [
      "future entitlement",
      paidEntitlement({ effectiveFrom: "2026-10-14T12:00:00.000Z" }),
      paidSubscription(),
      "entitlement_not_effective",
    ],
    [
      "entitlement end boundary",
      paidEntitlement({ effectiveUntil: now }),
      paidSubscription(),
      "entitlement_not_effective",
    ],
    [
      "trial subscription",
      paidEntitlement(),
      paidSubscription({ providerStatus: "trialing" }),
      "subscription_not_active",
    ],
    [
      "past-due subscription",
      paidEntitlement(),
      paidSubscription({ providerStatus: "past_due" }),
      "subscription_not_active",
    ],
    [
      "mismatched subscription id",
      paidEntitlement(),
      paidSubscription({ id: "another-projection" }),
      "subscription_mismatch",
    ],
    [
      "mismatched plan",
      paidEntitlement(),
      paidSubscription({ planCode: "starter" }),
      "subscription_mismatch",
    ],
    [
      "period end boundary",
      paidEntitlement(),
      paidSubscription({ currentPeriodEndsAt: now }),
      "subscription_period_not_current",
    ],
  ] as const)("denies %s", (_label, entitlement, subscription, reason) => {
    expect(
      evaluateAutomaticCollectionPlanEligibility({
        organizationId: "org-a",
        entitlement,
        subscription,
        now,
      })
    ).toEqual({ eligible: false, reason });
  });

  it("allows an in-window paid contract without inventing a Stripe subscription", () => {
    expect(
      evaluateAutomaticCollectionPlanEligibility({
        organizationId: "org-a",
        entitlement: paidEntitlement({
          source: "contract",
          subscriptionId: null,
        }),
        subscription: null,
        now,
      })
    ).toEqual({ eligible: true, reason: null, entitlementRevision: 4 });
  });
});

describe("family automatic-collection execution gates", () => {
  it("allows only a current paid family preference with matching payer evidence and released runtime", () => {
    expect(evaluateCollectionEligibility(eligibleInput())).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it.each([
    [
      "organization not active",
      { organization: { id: "org-a", status: "trial" as const } },
      "organization_not_active",
    ],
    [
      "manual family preference",
      {
        preference: {
          ...eligibleInput().preference,
          requestedMode: "manual" as const,
        },
      },
      "preference_manual",
    ],
    [
      "preference belongs to a prior entitlement revision",
      {
        preference: {
          ...eligibleInput().preference,
          entitlementRevision: 3,
        },
      },
      "preference_entitlement_stale",
    ],
    [
      "old manual charge",
      {
        charge: {
          ...eligibleInput().charge,
          collectionMode: "manual" as const,
        },
      },
      "charge_manual",
    ],
    [
      "payment account missing",
      { providerAccount: null },
      "provider_not_ready",
    ],
    [
      "payment account belongs to another organization",
      {
        providerAccount: {
          ...eligibleInput().providerAccount!,
          organizationId: "org-b",
        },
      },
      "provider_scope_mismatch",
    ],
    [
      "test account cannot run in live environment",
      { processorEnvironment: "live" as const },
      "provider_environment_mismatch",
    ],
    [
      "legacy account API generation",
      {
        providerAccount: {
          ...eligibleInput().providerAccount!,
          accountsApiGeneration: 1,
        },
      },
      "provider_api_generation_unsupported",
    ],
    [
      "unsupported destination charge account",
      {
        providerAccount: {
          ...eligibleInput().providerAccount!,
          chargeModel: "destination",
        },
      },
      "provider_charge_model_unsupported",
    ],
    [
      "inactive card payments capability",
      {
        providerAccount: {
          ...eligibleInput().providerAccount!,
          cardPaymentsCapabilityStatus: "pending",
        },
      },
      "provider_not_ready",
    ],
    [
      "authorization points at another connected account",
      {
        authorization: {
          ...eligibleInput().authorization!,
          paymentProviderAccountId: "provider-account-b",
        },
      },
      "authorization_provider_mismatch",
    ],
    ["missing payer authorization", { authorization: null }, "authorization_missing"],
    [
      "revoked authorization",
      {
        authorization: {
          ...eligibleInput().authorization!,
          status: "revoked" as const,
          revokedAt: now,
        },
      },
      "authorization_inactive",
    ],
    [
      "missing consent evidence",
      {
        authorization: {
          ...eligibleInput().authorization!,
          consentEvidenceSha256: null,
        },
      },
      "consent_incomplete",
    ],
    ["runtime not released", { runtimeEnabled: false }, "automation_not_released"],
  ] as const)("fails closed for %s", (_label, overrides, reason) => {
    expect(
      evaluateCollectionEligibility({
        ...eligibleInput(),
        ...overrides,
      } as CollectionEligibilityInput)
    ).toEqual({ eligible: false, reason });
  });

  it("rejects cross-tenant and cross-family preference or charge context", () => {
    expect(
      evaluateCollectionEligibility({
        ...eligibleInput(),
        preference: { ...eligibleInput().preference, familyId: "family-b" },
      })
    ).toEqual({ eligible: false, reason: "charge_scope_mismatch" });
    expect(
      evaluateCollectionEligibility({
        ...eligibleInput(),
        charge: { ...eligibleInput().charge, organizationId: "org-b" },
      })
    ).toEqual({ eligible: false, reason: "charge_scope_mismatch" });
    expect(
      evaluateCollectionEligibility({
        ...eligibleInput(),
        authorization: {
          ...eligibleInput().authorization!,
          familyPayerId: "another-payer",
        },
      })
    ).toEqual({ eligible: false, reason: "authorization_scope_mismatch" });
    expect(
      evaluateCollectionEligibility({
        ...eligibleInput(),
        providerAccount: {
          ...eligibleInput().providerAccount!,
          organizationId: "org-b",
        },
      })
    ).toEqual({ eligible: false, reason: "provider_scope_mismatch" });
  });
});
