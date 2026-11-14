import { describe, expect, it } from "vitest";

import {
  getCommercialLaunchProfile,
  getCommercialLaunchReadiness,
} from "@/lib/launch/commercial-launch-profile";
import {
  isCanonicalSpanishPersonalTaxId,
  isPublishableSpanishPostalAddress,
  isSpanishPostalCodeOutsideVatTerritory,
  isValidSpanishPersonalTaxId,
  normalizeSpanishTaxId,
  spanishPostalCodeOf,
} from "@/lib/launch/spanish-tax-id";

// Valores sintéticos de manual (letra de control correcta), no datos reales.
describe("formato de NIF/NIE de persona física", () => {
  it.each(["12345678Z", "00000000T", "X1234567L", "Y1234567X", "Z1234567R"])(
    "acepta %s con la letra de control correcta",
    (value) => {
      expect(isValidSpanishPersonalTaxId(value)).toBe(true);
      expect(isCanonicalSpanishPersonalTaxId(value)).toBe(true);
    }
  );

  it.each([
    ["letra de control equivocada", "12345678A"],
    ["NIE con letra equivocada", "X1234567A"],
    ["siete cifras", "1234567Z"],
    ["nueve cifras", "123456789Z"],
    ["sin letra", "12345678"],
    ["prefijo NIE no válido", "W1234567L"],
    ["CIF de sociedad", "B12345678"],
    ["vacío", ""],
  ])("rechaza %s (%s)", (_label, value) => {
    expect(isValidSpanishPersonalTaxId(value)).toBe(false);
    expect(isCanonicalSpanishPersonalTaxId(value)).toBe(false);
  });

  it("normaliza espacios, puntos y guiones, pero el perfil exige la forma canónica", () => {
    expect(normalizeSpanishTaxId(" 12.345.678-z ")).toBe("12345678Z");
    expect(isValidSpanishPersonalTaxId("12.345.678-z")).toBe(true);
    expect(isCanonicalSpanishPersonalTaxId("12.345.678-z")).toBe(false);
    expect(isCanonicalSpanishPersonalTaxId("12345678z")).toBe(false);
  });
});

describe("domicilio profesional publicable", () => {
  it("exige vía, coma y código postal español de cinco cifras", () => {
    expect(isPublishableSpanishPostalAddress("Calle Sintética 1, 2º B, 28001 Madrid (Madrid)")).toBe(true);
    expect(isPublishableSpanishPostalAddress("Calle Sintética 1 Madrid")).toBe(false);
    expect(isPublishableSpanishPostalAddress("Calle Sintética 1, Madrid")).toBe(false);
    expect(isPublishableSpanishPostalAddress("Calle Sintética 1, 99001 Madrid")).toBe(false);
    expect(isPublishableSpanishPostalAddress("C/ X, 28001")).toBe(false);
  });

  it("detecta los códigos postales fuera del territorio del IVA", () => {
    expect(spanishPostalCodeOf("Calle Sintética 12, 07001 Palma")).toBe("07001");
    expect(isSpanishPostalCodeOutsideVatTerritory("07001")).toBe(false);
    expect(isSpanishPostalCodeOutsideVatTerritory("28001")).toBe(false);
    for (const code of ["35001", "38001", "51001", "52001"]) {
      expect(isSpanishPostalCodeOutsideVatTerritory(code), code).toBe(true);
    }
  });
});

describe("perfil real del vendedor", () => {
  // NIF y domicilio ya no están en el código (repositorio público): llegan de
  // ZALTYKO_SELLER_TAX_ID y ZALTYKO_SELLER_PROFESSIONAL_ADDRESS en Vercel. Sin
  // ellas, el perfil los deja en null y la readiness lo rechaza.
  const profile = getCommercialLaunchProfile({});

  it("no lleva NIF ni domicilio en el código", () => {
    expect(profile.taxId).toBeNull();
    expect(profile.professionalAddress).toBeNull();
  });

  it("tiene fecha de alta válida y, con verified pero sin variables, sigue bloqueado", () => {
    expect(profile.registrationVerifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (profile.registrationStatus !== "verified") return;
    const { ready, missing } = getCommercialLaunchReadiness(profile);
    expect(ready).toBe(false);
    expect(missing).toEqual(expect.arrayContaining(["seller_tax_id", "seller_address", "registration_incomplete"]));
  });
});
