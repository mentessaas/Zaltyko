import { describe, expect, it } from "vitest";
import {
  commercialLaunchProfile,
  getCommercialLaunchReadiness,
  isSaasCheckoutEnabled,
  isSaasCheckoutEnabledForMarket,
  type CommercialLaunchProfile,
} from "@/lib/launch/commercial-launch-profile";

describe("live contracting requires verified seller and tax readiness", () => {
  const complete: CommercialLaunchProfile = {
    legalName: "Vendedor sintético",
    countryCode: "ES",
    taxId: "synthetic-tax-reference",
    professionalAddress: "Domicilio sintético",
    supportEmail: "support@example.invalid",
    registrationStatus: "verified",
    supportMailboxVerified: true,
    taxTreatmentReviewed: true,
    checkoutTaxVerified: true,
    legalTextsApproved: true,
    liveReleaseApproved: true,
  };

  it("keeps real charges closed while test checkout remains available", () => {
    expect(commercialLaunchProfile.registrationStatus).toBe("verified");
    expect(commercialLaunchProfile.taxId?.trim()).toBeTruthy();
    expect(commercialLaunchProfile.professionalAddress?.trim()).toBeTruthy();
    expect(commercialLaunchProfile.taxTreatmentReviewed).toBe(false);
    expect(commercialLaunchProfile.checkoutTaxVerified).toBe(false);
    expect(commercialLaunchProfile.legalTextsApproved).toBe(false);
    expect(commercialLaunchProfile.liveReleaseApproved).toBe(false);
    expect(isSaasCheckoutEnabled("live")).toBe(false);
    expect(isSaasCheckoutEnabled("test")).toBe(true);
  });

  it.each([
    ["legalName", "  "], ["countryCode", "US"], ["taxId", null],
    ["taxId", "  "], ["professionalAddress", null], ["professionalAddress", "  "],
    ["registrationStatus", "pending"], ["supportEmail", " "],
    ["supportMailboxVerified", false], ["taxTreatmentReviewed", false],
    ["checkoutTaxVerified", false], ["legalTextsApproved", false], ["liveReleaseApproved", false],
  ] as const)("fails closed when %s is incomplete (%s)", (field, value) => {
    const result = getCommercialLaunchReadiness({ ...complete, [field]: value });
    expect(result.ready).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it("does not treat documented registration and identity as tax or release approval", () => {
    const result = getCommercialLaunchReadiness();
    expect(result.ready).toBe(false);
    expect(result.missing).not.toContain("registration");
    expect(result.missing).not.toContain("seller_tax_id");
    expect(result.missing).not.toContain("seller_address");
    expect(result.missing).toEqual(expect.arrayContaining(["checkout_tax", "tax_treatment", "legal_texts", "live_release"]));
    expect(getCommercialLaunchReadiness(complete)).toEqual({ ready: true, missing: [] });
  });

  it("keeps Live checkout country-specific after global seller readiness opens", () => {
    expect(isSaasCheckoutEnabledForMarket("live", "ES", complete)).toBe(true);
    expect(isSaasCheckoutEnabledForMarket("live", "MX", complete)).toBe(false);
    expect(isSaasCheckoutEnabledForMarket("live", "FR", complete)).toBe(false);
    expect(isSaasCheckoutEnabledForMarket("live", "ZZ", complete)).toBe(false);
    expect(isSaasCheckoutEnabledForMarket("test", "MX", commercialLaunchProfile)).toBe(true);
  });
});
