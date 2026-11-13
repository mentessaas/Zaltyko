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
    // Valores sintéticos con formato válido; no son datos del vendedor.
    taxId: "12345678Z",
    professionalAddress: "Calle Sintética 1, 2º B, 28001 Madrid (Madrid)",
    supportEmail: "support@example.invalid",
    registrationStatus: "verified",
    registrationVerifiedOn: "2026-11-01",
    supportMailboxVerified: true,
    taxTreatmentReviewed: true,
    checkoutTaxVerified: true,
    legalTextsApproved: true,
    liveReleaseApproved: true,
  };

  it("keeps real charges closed while test checkout remains available", () => {
    expect(commercialLaunchProfile.registrationStatus).toBe("pending");
    expect(commercialLaunchProfile.taxId).toBeNull();
    expect(commercialLaunchProfile.professionalAddress).toBeNull();
    expect(commercialLaunchProfile.registrationVerifiedOn).toBeNull();
    // Ninguna bandera de verificación se marca en este cambio.
    expect(commercialLaunchProfile).toMatchObject({
      supportMailboxVerified: false, taxTreatmentReviewed: false, checkoutTaxVerified: false,
      legalTextsApproved: false, liveReleaseApproved: false,
    });
    expect(isSaasCheckoutEnabled("live")).toBe(false);
    expect(isSaasCheckoutEnabled("test")).toBe(true);
  });

  it.each([
    ["legalName", "  "], ["countryCode", "US"], ["taxId", null],
    ["taxId", "  "], ["professionalAddress", null], ["professionalAddress", "  "],
    ["registrationStatus", "pending"], ["registrationVerifiedOn", null],
    ["registrationVerifiedOn", "2026-02-30"], ["registrationVerifiedOn", "1-11-2026"],
    ["supportEmail", " "],
    ["supportMailboxVerified", false], ["taxTreatmentReviewed", false],
    ["checkoutTaxVerified", false], ["legalTextsApproved", false], ["liveReleaseApproved", false],
  ] as const)("fails closed when %s is incomplete (%s)", (field, value) => {
    const result = getCommercialLaunchReadiness({ ...complete, [field]: value });
    expect(result.ready).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it.each([
    ["taxId", "12345678A", "seller_tax_id_format"],
    ["taxId", "12345678z", "seller_tax_id_format"],
    ["taxId", "12.345.678-Z", "seller_tax_id_format"],
    ["taxId", "synthetic-tax-reference", "seller_tax_id_format"],
    ["professionalAddress", "Domicilio sintético", "seller_address_format"],
    ["professionalAddress", "Calle Sintética 1, Madrid", "seller_address_format"],
    ["professionalAddress", "Calle Sintética 1, 35001 Las Palmas", "seller_tax_territory_review"],
    ["professionalAddress", "Calle Sintética 1, 38001 Santa Cruz de Tenerife", "seller_tax_territory_review"],
    ["professionalAddress", "Calle Sintética 1, 51001 Ceuta", "seller_tax_territory_review"],
    ["professionalAddress", "Calle Sintética 1, 52001 Melilla", "seller_tax_territory_review"],
  ] as const)("rejects malformed %s %s as %s", (field, value, code) => {
    const result = getCommercialLaunchReadiness({ ...complete, [field]: value });
    expect(result).toEqual({ ready: false, missing: [code] });
  });

  it("accepts a NIE and an address in the Balearic Islands", () => {
    expect(getCommercialLaunchReadiness({
      ...complete, taxId: "X1234567L", professionalAddress: "Calle Sintética 1, 07001 Palma (Illes Balears)",
    })).toEqual({ ready: true, missing: [] });
  });

  it("does not treat identity completion as verification of registration, taxes or release", () => {
    const result = getCommercialLaunchReadiness({
      ...commercialLaunchProfile, taxId: complete.taxId, professionalAddress: complete.professionalAddress,
    });
    expect(result.missing).not.toContain("seller_tax_id");
    expect(result.missing).not.toContain("seller_address");
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(["registration", "checkout_tax", "tax_treatment", "legal_texts", "live_release"]));
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
