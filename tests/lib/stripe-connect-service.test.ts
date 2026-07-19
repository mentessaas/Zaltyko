import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { mapOnboardingStatus, isConnectReady } from "@/lib/stripe/connect-service";
import type { ConnectAccountRow } from "@/lib/stripe/connect-service";

function account(partial: Partial<Stripe.Account>): Stripe.Account {
  return {
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    requirements: { currently_due: [], past_due: [], disabled_reason: null },
    ...partial,
  } as unknown as Stripe.Account;
}

describe("mapOnboardingStatus", () => {
  it("returns enabled when charges and payouts are enabled", () => {
    expect(
      mapOnboardingStatus(account({ charges_enabled: true, payouts_enabled: true, details_submitted: true }))
    ).toBe("enabled");
  });

  it("returns onboarding when details are not submitted", () => {
    expect(mapOnboardingStatus(account({ details_submitted: false }))).toBe("onboarding");
  });

  it("returns disabled when details submitted but blocked and charges off", () => {
    expect(
      mapOnboardingStatus(
        account({
          details_submitted: true,
          charges_enabled: false,
          requirements: { currently_due: ["external_account"], past_due: [], disabled_reason: "requirements.past_due" },
        } as Partial<Stripe.Account>)
      )
    ).toBe("disabled");
  });

  it("returns restricted when charges on but requirements pending", () => {
    expect(
      mapOnboardingStatus(
        account({
          details_submitted: true,
          charges_enabled: true,
          payouts_enabled: false,
          requirements: { currently_due: ["tos_acceptance"], past_due: [], disabled_reason: null },
        } as Partial<Stripe.Account>)
      )
    ).toBe("restricted");
  });
});

describe("isConnectReady", () => {
  const base: ConnectAccountRow = {
    id: "1",
    tenantId: "t",
    academyId: "a",
    stripeAccountId: "acct_1",
    country: "ES",
    defaultCurrency: "eur",
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    onboardingStatus: "enabled",
    lastSyncedAt: null,
  };

  it("is ready when enabled and charges enabled", () => {
    expect(isConnectReady(base)).toBe(true);
  });

  it("is not ready when charges disabled", () => {
    expect(isConnectReady({ ...base, chargesEnabled: false })).toBe(false);
  });

  it("is not ready when null", () => {
    expect(isConnectReady(null)).toBe(false);
  });
});
