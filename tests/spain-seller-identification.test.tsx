import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SellerIdentification } from "@/components/legal/SellerIdentification";
import { decodeStoredSaasCommand } from "@/components/owner-dashboard/owner-saas-pending-command";
import {
  commercialLaunchProfile,
  type CommercialLaunchProfile,
} from "@/lib/launch/commercial-launch-profile";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("identificación del prestador (LSSI art. 10) en Términos y Privacidad", () => {
  it("muestra los datos pendientes del perfil actual sin inventarlos", () => {
    const html = text(renderToStaticMarkup(createElement(SellerIdentification)));
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

  it("acepta la sede fiscal cubierta y rechaza cualquier otra", () => {
    expect(decodeStoredSaasCommand(stored({}), organizationId)).not.toBeNull();
    expect(decodeStoredSaasCommand(stored({ taxTerritory: "peninsula_baleares" }), organizationId)).not.toBeNull();
    for (const taxTerritory of ["canarias", "ceuta", "melilla", "otra", null]) {
      expect(decodeStoredSaasCommand(stored({ taxTerritory }), organizationId), String(taxTerritory)).toBeNull();
    }
    expect(decodeStoredSaasCommand(stored({ coupon: "x" }), organizationId)).toBeNull();
  });
});
