import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SellerIdentification } from "@/components/legal/SellerIdentification";
import { decodeStoredSaasCommand } from "@/components/owner-dashboard/owner-saas-pending-command";
import {
  getCommercialLaunchProfile,
  type CommercialLaunchProfile,
} from "@/lib/launch/commercial-launch-profile";

// El perfil real lee NIF y domicilio del entorno del servidor; aquí, sin variables.
const commercialLaunchProfile = getCommercialLaunchProfile({});

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("identificación del prestador (LSSI art. 10) en Términos y Privacidad", () => {
  it("muestra los datos pendientes del perfil actual sin inventarlos", () => {
    const html = text(renderToStaticMarkup(createElement(SellerIdentification, { profile: commercialLaunchProfile })));
    expect(html).toContain(commercialLaunchProfile.legalName);
    expect(html).toContain(commercialLaunchProfile.supportEmail);
    if (commercialLaunchProfile.taxId === null) expect(html).toContain("NIF Pendiente de completar");
    if (commercialLaunchProfile.professionalAddress === null) {
      expect(html).toContain("Domicilio profesional Pendiente de completar");
    }
  });

  it("publica NIF, domicilio y titular en cuanto el perfil está completo", () => {
    // Valores sintéticos con formato válido; no son datos del vendedor.
    const complete: CommercialLaunchProfile = {
      ...commercialLaunchProfile,
      taxId: "12345678Z",
      professionalAddress: "Calle Sintética 1, 28001 Madrid",
      registrationStatus: "verified",
      registrationVerifiedOn: "2026-11-01",
      supportMailboxVerified: true,
      taxTreatmentReviewed: true,
      checkoutTaxVerified: true,
      legalTextsApproved: true,
      invoicingIntegrationReady: true,
      liveReleaseApproved: true,
    };
    const html = text(renderToStaticMarkup(createElement(SellerIdentification, { profile: complete })));
    expect(html).toContain("Titular");
    expect(html).not.toContain("futuro titular");
    expect(html).toContain("NIF 12345678Z");
    expect(html).toContain("Domicilio profesional Calle Sintética 1, 28001 Madrid");
    expect(html).not.toContain("Pendiente de completar");
    expect(html).not.toContain("Información legal en preparación");
  });
});

describe("operación de contratación pendiente guardada en el navegador", () => {
  const organizationId = "10000000-0000-4000-8000-000000000001";
  const stored = (body: Record<string, unknown>) => ({
    organizationId,
    action: "checkout",
    planCode: "starter",
    billingInterval: "month",
    key: "synthetic-key-1234",
    serializedBody: JSON.stringify({ organizationId, planCode: "starter", billingInterval: "month", ...body }),
  });

  it("acepta la sede fiscal cubierta y la casilla marcada, y rechaza cualquier otra cosa", () => {
    expect(decodeStoredSaasCommand(stored({}), organizationId)).not.toBeNull();
    expect(decodeStoredSaasCommand(stored({ taxTerritory: "peninsula_baleares" }), organizationId)).not.toBeNull();
    expect(decodeStoredSaasCommand(stored({
      taxTerritory: "peninsula_baleares", immediateStartConsent: true,
    }), organizationId)).not.toBeNull();
    for (const taxTerritory of ["canarias", "ceuta", "melilla", "otra", null]) {
      expect(decodeStoredSaasCommand(stored({ taxTerritory }), organizationId), String(taxTerritory)).toBeNull();
    }
    for (const immediateStartConsent of [false, "true", 1]) {
      expect(decodeStoredSaasCommand(stored({
        taxTerritory: "peninsula_baleares", immediateStartConsent,
      }), organizationId), String(immediateStartConsent)).toBeNull();
    }
    expect(decodeStoredSaasCommand(stored({ coupon: "x" }), organizationId)).toBeNull();
    expect(decodeStoredSaasCommand(stored({ constructor: "x" }), organizationId)).toBeNull();
  });

  it("conserva los datos de factura enviados y rechaza formas inesperadas", () => {
    // CIF sintético generado con el algoritmo de control.
    const billingDetails = { legalName: "Club Sintético", taxId: "B12345674" };
    expect(decodeStoredSaasCommand(stored({
      taxTerritory: "peninsula_baleares", immediateStartConsent: true, billingDetails,
    }), organizationId)).not.toBeNull();
    for (const invalid of [
      null, "B12345674", { legalName: "Club Sintético" }, { ...billingDetails, extra: "x" },
      { legalName: 1, taxId: "B12345674" }, { legalName: "Club Sintético", taxId: "B".repeat(41) },
    ]) {
      expect(decodeStoredSaasCommand(stored({ billingDetails: invalid }), organizationId), JSON.stringify(invalid)).toBeNull();
    }
  });
});
