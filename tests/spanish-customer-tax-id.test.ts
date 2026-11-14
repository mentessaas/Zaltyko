import { describe, expect, it } from "vitest";

import {
  checkSpanishTaxId,
  isValidSpanishOrganizationTaxId,
  isValidSpanishPersonalTaxId,
  isValidSpanishTaxId,
} from "@/lib/launch/spanish-tax-id";
import {
  auditInvoiceCustomerTaxIds,
  parseSaasCustomerBillingDetails,
  SAAS_BILLING_DETAILS_ERROR_CODES,
  SAAS_BILLING_DETAILS_MESSAGES,
} from "@/modules/saas-billing/domain/customer-billing-details";

// Todos los identificadores son sintéticos: cifras secuenciales o repetidas
// con el carácter de control calculado por el algoritmo. No son datos reales.
describe("NIF/NIE/CIF de cliente con carácter de control", () => {
  it.each([
    ["DNI", "12345678Z", "dni"],
    ["DNI", "00000001R", "dni"],
    ["NIE X", "X1234567L", "nie"],
    ["NIE Y", "Y0000001S", "nie"],
    ["NIE Z", "Z0000001Y", "nie"],
    ["NIF K", "K1234567L", "nif_klm"],
    ["NIF M", "M0000001R", "nif_klm"],
    ["CIF A (cifra)", "A00000018", "cif"],
    ["CIF B (cifra)", "B12345674", "cif"],
    ["CIF E (cifra)", "E99999997", "cif"],
    ["CIF H (cifra)", "H22222228", "cif"],
    ["CIF P (letra)", "P1234567D", "cif"],
    ["CIF Q (letra)", "Q0000001H", "cif"],
    ["CIF R (letra)", "R5555555A", "cif"],
    ["CIF S (letra)", "S9999999G", "cif"],
    ["CIF N (letra)", "N1111111I", "cif"],
    ["CIF W (letra)", "W1234567D", "cif"],
    ["CIF G con cifra", "G12345674", "cif"],
    ["CIF G con letra", "G1234567D", "cif"],
    ["CIF J con cifra", "J00000018", "cif"],
    ["CIF J con letra", "J0000001H", "cif"],
    ["CIF C con letra", "C9999999G", "cif"],
    ["CIF D con cifra", "D99999997", "cif"],
    ["CIF F con cifra", "F12345674", "cif"],
    ["CIF U con letra", "U1111111I", "cif"],
    ["CIF V con cifra", "V22222228", "cif"],
  ] as const)("acepta %s %s", (_label, value, kind) => {
    expect(checkSpanishTaxId(value)).toEqual({ valid: true, kind, value });
    expect(isValidSpanishTaxId(value)).toBe(true);
    expect(isValidSpanishOrganizationTaxId(value)).toBe(kind === "cif");
  });

  it.each([
    ["DNI con letra equivocada", "12345678A", "control"],
    ["NIE con letra equivocada", "X1234567A", "control"],
    ["NIF M con letra equivocada", "M1234567A", "control"],
    ["CIF con cifra equivocada", "B12345675", "control"],
    ["CIF A con letra (exige cifra)", "A0000001H", "control"],
    ["CIF B con letra (exige cifra)", "B1234567D", "control"],
    ["CIF E con letra (exige cifra)", "E9999999G", "control"],
    ["CIF H con letra (exige cifra)", "H2222222H", "control"],
    ["CIF P con cifra (exige letra)", "P12345674", "control"],
    ["CIF Q con cifra (exige letra)", "Q00000018", "control"],
    ["CIF R con cifra (exige letra)", "R55555551", "control"],
    ["CIF S con cifra (exige letra)", "S99999997", "control"],
    ["CIF N con cifra (exige letra)", "N11111119", "control"],
    ["CIF W con cifra (exige letra)", "W12345674", "control"],
    ["CIF G con letra equivocada", "G1234567C", "control"],
    ["CIF G con cifra equivocada", "G12345673", "control"],
    ["letra de entidad inexistente (I)", "I12345674", "format"],
    ["letra de entidad inexistente (T)", "T1234567D", "format"],
    ["CIF con control fuera de rango", "B1234567Z", "format"],
    ["ocho caracteres", "B1234567", "format"],
    ["diez caracteres", "B123456745", "format"],
    ["solo cifras", "123456789", "format"],
    ["prefijo de otro país", "FRB12345674", "format"],
    ["vacío", "", "empty"],
    ["solo separadores", " - . ", "empty"],
  ] as const)("rechaza %s (%s)", (_label, value, reason) => {
    expect(checkSpanishTaxId(value)).toEqual({ valid: false, reason });
    expect(isValidSpanishTaxId(value)).toBe(false);
    expect(isValidSpanishOrganizationTaxId(value)).toBe(false);
  });

  it("normaliza espacios, puntos, guiones, minúsculas y el prefijo ES del NIF-IVA", () => {
    expect(checkSpanishTaxId(" b-1234567.4 ")).toEqual({ valid: true, kind: "cif", value: "B12345674" });
    expect(checkSpanishTaxId("ESB12345674")).toEqual({ valid: true, kind: "cif", value: "B12345674" });
    expect(checkSpanishTaxId("es 12345678-z")).toEqual({ valid: true, kind: "dni", value: "12345678Z" });
    expect(checkSpanishTaxId("ESB12345675")).toEqual({ valid: false, reason: "control" });
  });

  it("no cambia la validación del NIF del vendedor persona física", () => {
    expect(isValidSpanishPersonalTaxId("12345678Z")).toBe(true);
    expect(isValidSpanishPersonalTaxId("X1234567L")).toBe(true);
    expect(isValidSpanishPersonalTaxId("B12345674")).toBe(false);
    expect(isValidSpanishPersonalTaxId("M0000001R")).toBe(false);
  });
});

describe("datos de factura del cliente del SaaS", () => {
  it("devuelve razón social normalizada y NIF canónico", () => {
    expect(parseSaasCustomerBillingDetails({ legalName: "  Club   Sintético ", taxId: "b-1234567.4" })).toEqual({
      ok: true,
      details: { legalName: "Club Sintético", taxId: "B12345674", taxIdKind: "cif" },
    });
  });

  it.each([
    ["sin datos", null, "billing_details_required"],
    ["razón social vacía", { legalName: "   ", taxId: "B12345674" }, "legal_name_required"],
    ["razón social de una letra", { legalName: "A", taxId: "B12345674" }, "legal_name_invalid"],
    ["razón social con salto de línea", { legalName: "Club\nSintético", taxId: "B12345674" }, "legal_name_invalid"],
    ["razón social demasiado larga", { legalName: "C".repeat(151), taxId: "B12345674" }, "legal_name_invalid"],
    ["NIF vacío", { legalName: "Club Sintético", taxId: "" }, "tax_id_required"],
    ["NIF sin formato español", { legalName: "Club Sintético", taxId: "FR123" }, "tax_id_format"],
    ["CIF con control incorrecto", { legalName: "Club Sintético", taxId: "B12345675" }, "tax_id_control"],
  ] as const)("rechaza %s", (_label, input, reason) => {
    expect(parseSaasCustomerBillingDetails(input)).toEqual({ ok: false, reason });
    expect(SAAS_BILLING_DETAILS_MESSAGES[reason]).toMatch(/\S/u);
    expect(SAAS_BILLING_DETAILS_ERROR_CODES[reason]).toMatch(/^SAAS_BILLING_/u);
  });

  it("explica al usuario por qué un NIF con el control incorrecto no vale", () => {
    expect(SAAS_BILLING_DETAILS_MESSAGES.tax_id_control).toContain("la letra o el dígito de control no coincide");
  });
});

describe("revisión del NIF en la factura pagada (sin bloquear el pago)", () => {
  const invoice = (customer_tax_ids: unknown) => ({ id: "in_synthetic", customer_tax_ids });

  it.each([
    ["es_cif válido", [{ type: "es_cif", value: "B12345674" }]],
    ["eu_vat español válido", [{ type: "eu_vat", value: "ESB12345674" }]],
    ["DNI en es_cif", [{ type: "es_cif", value: "12345678Z" }]],
  ])("no alerta con %s", (_label, taxIds) => {
    expect(auditInvoiceCustomerTaxIds(invoice(taxIds))).toBeNull();
  });

  it.each([
    ["sin NIF", null, "missing"],
    ["lista vacía", [], "missing"],
    ["NIF sin valor", [{ type: "es_cif" }], "missing"],
    ["dos NIF", [{ type: "es_cif", value: "B12345674" }, { type: "eu_vat", value: "ESB12345674" }], "multiple"],
    ["es_cif con control incorrecto", [{ type: "es_cif", value: "B12345675" }], "invalid_spanish_tax_id"],
    ["eu_vat ES con control incorrecto", [{ type: "eu_vat", value: "ESB12345675" }], "invalid_spanish_tax_id"],
    ["eu_vat de otro país", [{ type: "eu_vat", value: "FR12345678901" }], "not_spanish"],
    ["otro tipo", [{ type: "mx_rfc", value: "XAXX010101000" }], "not_spanish"],
  ])("alerta con %s", (_label, taxIds, issue) => {
    expect(auditInvoiceCustomerTaxIds(invoice(taxIds))).toBe(issue);
  });
});
