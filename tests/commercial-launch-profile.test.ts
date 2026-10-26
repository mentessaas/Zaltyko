import { describe, expect, it } from "vitest";
import {
  commercialLaunchProfile,
  getCommercialLaunchReadiness,
  isSaasCheckoutEnabled,
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
    expect(commercialLaunchProfile.registrationStatus).toBe("pending");
    expect(commercialLaunchProfile.taxId).toBeNull();
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

  it("does not treat identity completion as verification of registration, taxes or release", () => {
    const result = getCommercialLaunchReadiness({
      ...commercialLaunchProfile, taxId: complete.taxId, professionalAddress: complete.professionalAddress,
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(["registration", "checkout_tax", "tax_treatment", "legal_texts", "live_release"]));
    expect(getCommercialLaunchReadiness(complete)).toEqual({ ready: true, missing: [] });
  });
});
