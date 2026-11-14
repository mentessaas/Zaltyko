import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCommercialLaunchProfile,
  getCommercialLaunchReadiness,
  isSaasCheckoutEnabled,
  isSaasCheckoutEnabledForMarket,
  type CommercialLaunchProfile,
} from "@/lib/launch/commercial-launch-profile";

describe("live contracting requires verified seller and tax readiness", () => {
  // El perfil real lee NIF y domicilio del entorno: en estas pruebas faltan.
  beforeEach(() => {
    vi.stubEnv("ZALTYKO_SELLER_TAX_ID", undefined);
    vi.stubEnv("ZALTYKO_SELLER_PROFESSIONAL_ADDRESS", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const commercialLaunchProfile = getCommercialLaunchProfile({});

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
    invoicingIntegrationReady: true,
    liveReleaseApproved: true,
  };

  it("keeps real charges closed while test checkout remains available", () => {
    // Alta en Hacienda y RETA verificada con el modelo 036 (13-11-2026).
    expect(commercialLaunchProfile.registrationStatus).toBe("verified");
    expect(commercialLaunchProfile.registrationVerifiedOn).toBe("2026-11-05");
    // Sin variables de entorno no hay NIF ni domicilio.
    expect(commercialLaunchProfile.taxId).toBeNull();
    expect(commercialLaunchProfile.professionalAddress).toBeNull();
    // Tratamiento fiscal de España revisado con el gestor; el resto sigue sin marcar.
    expect(commercialLaunchProfile).toMatchObject({
      taxTreatmentReviewed: true,
      supportMailboxVerified: false, checkoutTaxVerified: false,
      legalTextsApproved: false, invoicingIntegrationReady: false, liveReleaseApproved: false,
    });
    const { missing } = getCommercialLaunchReadiness();
    expect(missing).toEqual(expect.arrayContaining([
      "seller_tax_id", "seller_address", "registration_incomplete", "invoicing_integration",
    ]));
    expect(missing).not.toContain("registration");
    expect(missing).not.toContain("tax_treatment");
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
    ["invoicingIntegrationReady", false],
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

  it("only accepts verified registration together with tax ID and address", () => {
    for (const field of ["taxId", "professionalAddress"] as const) {
      const result = getCommercialLaunchReadiness({ ...complete, [field]: null });
      expect(result.ready).toBe(false);
      expect(result.missing).toContain("registration_incomplete");
    }
  });

  it("keeps Live closed until every charge produces a ZA invoice outside Stripe", () => {
    expect(getCommercialLaunchReadiness({ ...complete, invoicingIntegrationReady: false }))
      .toEqual({ ready: false, missing: ["invoicing_integration"] });
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
    expect(result.missing).not.toContain("registration_incomplete");
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(["support_mailbox", "checkout_tax", "legal_texts", "invoicing_integration", "live_release"]));
    expect(getCommercialLaunchReadiness({ ...complete, taxTreatmentReviewed: false }).missing)
      .toEqual(["tax_treatment"]);
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
