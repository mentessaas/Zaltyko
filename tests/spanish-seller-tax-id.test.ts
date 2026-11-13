import { describe, expect, it } from "vitest";

import { commercialLaunchProfile } from "@/lib/launch/commercial-launch-profile";
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
  // Esta comprobación protege el cambio de Elvis en el editor web: un NIF con
  // la letra mal escrita o un domicilio incompleto no pasan CI.
  it("tiene NIF vacío o un NIF/NIE canónico con letra de control correcta", () => {
    const { taxId } = commercialLaunchProfile;
    if (taxId !== null) expect(isCanonicalSpanishPersonalTaxId(taxId), "taxId").toBe(true);
  });

  it("tiene domicilio vacío o una dirección postal completa dentro del territorio IVA", () => {
    const { professionalAddress } = commercialLaunchProfile;
    if (professionalAddress === null) return;
    expect(isPublishableSpanishPostalAddress(professionalAddress), "professionalAddress").toBe(true);
    expect(isSpanishPostalCodeOutsideVatTerritory(spanishPostalCodeOf(professionalAddress)!)).toBe(false);
  });

  it("solo pasa a verified con NIF, domicilio y fecha de alta", () => {
    const profile = commercialLaunchProfile;
    if (profile.registrationVerifiedOn !== null) {
      expect(profile.registrationVerifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    if (profile.registrationStatus !== "verified") return;
    expect(profile.taxId).not.toBeNull();
    expect(profile.professionalAddress).not.toBeNull();
    expect(profile.registrationVerifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
