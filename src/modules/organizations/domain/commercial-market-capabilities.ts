/** Commercial availability is independent of administrative onboarding. */
export type CommercialMarketCode = "ES" | "MX";

export interface CommercialMarketCapability {
  countryCode: CommercialMarketCode;
  label: string;
  liveSaasCheckoutEnabled: boolean;
}

export const COMMERCIAL_MARKET_REGISTRY = {
  ES: {
    countryCode: "ES",
    label: "España",
    liveSaasCheckoutEnabled: true,
  },
  MX: {
    countryCode: "MX",
    label: "México",
    liveSaasCheckoutEnabled: false,
  },
} as const satisfies Record<CommercialMarketCode, CommercialMarketCapability>;

/** Unknown countries remain closed for Live contracting until reviewed. */
export function isCommercialMarketLiveCheckoutEnabled(
  countryCode: string
): boolean {
  if (
    !Object.prototype.hasOwnProperty.call(
      COMMERCIAL_MARKET_REGISTRY,
      countryCode
    )
  ) {
    return false;
  }

  return COMMERCIAL_MARKET_REGISTRY[
    countryCode as CommercialMarketCode
  ].liveSaasCheckoutEnabled;
}
