import { isCommercialMarketLiveCheckoutEnabled } from "@/modules/organizations/domain/commercial-market-capabilities";

/** Public seller information. Never put credentials or identity documents here. */
export interface CommercialLaunchProfile {
  legalName: string;
  countryCode: string;
  taxId: string | null;
  professionalAddress: string | null;
  supportEmail: string;
  registrationStatus: "pending" | "verified";
  supportMailboxVerified: boolean;
  taxTreatmentReviewed: boolean;
  checkoutTaxVerified: boolean;
  legalTextsApproved: boolean;
  liveReleaseApproved: boolean;
}

// Registration documents dated 5 November 2026 reviewed; address use authorized 6 November.
// Documentary registration verification is separate from software tax treatment and release.
// Filling identity fields alone must not enable real charges or imply tax validation.
export const commercialLaunchProfile: Readonly<CommercialLaunchProfile> = {
  legalName: "Elvis Lazaro Valdes Inerarte",
  countryCode: "ES",
  taxId: "Z3452134T",
  professionalAddress: "C/ Lagunillas 66, Piso 3, Puerta A, 29012, Málaga, España",
  supportEmail: "hola@zaltyko.com",
  registrationStatus: "verified",
  supportMailboxVerified: false,
  taxTreatmentReviewed: false,
  checkoutTaxVerified: false,
  legalTextsApproved: false,
  liveReleaseApproved: false,
};

export function getCommercialLaunchReadiness(
  profile: Readonly<CommercialLaunchProfile> = commercialLaunchProfile
): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!profile.legalName.trim()) missing.push("seller_name");
  if (profile.countryCode !== "ES") missing.push("seller_country_review");
  if (!profile.taxId?.trim()) missing.push("seller_tax_id");
  if (!profile.professionalAddress?.trim()) missing.push("seller_address");
  if (profile.registrationStatus !== "verified") missing.push("registration");
  if (!profile.supportEmail.trim() || !profile.supportMailboxVerified) missing.push("support_mailbox");
  if (!profile.taxTreatmentReviewed) missing.push("tax_treatment");
  if (!profile.checkoutTaxVerified) missing.push("checkout_tax");
  if (!profile.legalTextsApproved) missing.push("legal_texts");
  if (!profile.liveReleaseApproved) missing.push("live_release");
  return { ready: missing.length === 0, missing };
}

/** Test mode remains available; this gate never disables Portal or signed webhooks. */
export function isSaasCheckoutEnabled(environment: "test" | "live"): boolean {
  return environment === "test" || getCommercialLaunchReadiness().ready;
}

/** Test Checkout stays available; Live also requires an enabled buyer market. */
export function isSaasCheckoutEnabledForMarket(
  environment: "test" | "live",
  countryCode: string,
  profile: Readonly<CommercialLaunchProfile> = commercialLaunchProfile
): boolean {
  if (environment === "test") return true;
  return (
    isCommercialMarketLiveCheckoutEnabled(countryCode) &&
    getCommercialLaunchReadiness(profile).ready
  );
}
