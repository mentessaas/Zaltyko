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

// Human declaration, 26 October 2026: planned sole trader in Spain; not yet registered.
// Filling identity fields alone must not enable real charges or imply tax validation.
export const commercialLaunchProfile: Readonly<CommercialLaunchProfile> = {
  legalName: "Elvis Valdes Inerarte",
  countryCode: "ES",
  taxId: null,
  professionalAddress: null,
  supportEmail: "hola@zaltyko.com",
  registrationStatus: "pending",
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
