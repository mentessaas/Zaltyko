import {
  checkSpanishTaxId,
  type SpanishTaxIdKind,
} from "@/lib/launch/spanish-tax-id";

/**
 * Datos de factura del cliente que contrata el SaaS con IVA español.
 *
 * FacturaDirecta (serie ZA, vía n8n) rechaza un NIF con el carácter de
 * control incorrecto, y Stripe solo comprueba el formato. Por eso Zaltyko los
 * pide antes de abrir Checkout, los valida aquí y los guarda en el Customer
 * de Stripe (`name` y un único `tax_id` de tipo `es_cif`), de donde los copia
 * cada factura (`customer_name`, `customer_tax_ids`). No se guardan en la base
 * de datos de Zaltyko.
 */

export const SAAS_BILLING_LEGAL_NAME_MAX_LENGTH = 150;
/** Tipo de Stripe para cualquier NIF español (persona física o entidad). */
export const SPANISH_STRIPE_TAX_ID_TYPE = "es_cif";

export interface SaasCustomerBillingDetailsInput {
  legalName: string;
  taxId: string;
}

export interface SaasCustomerBillingDetails {
  /** Razón social o nombre y apellidos del titular, con espacios normalizados. */
  legalName: string;
  /** NIF canónico: mayúsculas, sin separadores ni prefijo ES. */
  taxId: string;
  taxIdKind: SpanishTaxIdKind;
}

export type SaasBillingDetailsRejection =
  | "billing_details_required"
  | "legal_name_required"
  | "legal_name_invalid"
  | "tax_id_required"
  | "tax_id_format"
  | "tax_id_control";

export const SAAS_BILLING_DETAILS_MESSAGES: Record<SaasBillingDetailsRejection, string> = {
  billing_details_required:
    "Indica la razón social y el NIF o CIF que deben figurar en la factura antes de contratar.",
  legal_name_required:
    "Indica la razón social de la academia o el nombre y apellidos del titular para la factura.",
  legal_name_invalid: `La razón social debe tener entre 2 y ${SAAS_BILLING_LEGAL_NAME_MAX_LENGTH} caracteres y no puede contener saltos de línea.`,
  tax_id_required: "Indica el NIF, NIE o CIF que debe figurar en la factura.",
  tax_id_format:
    "El NIF, NIE o CIF no tiene un formato español válido. Debe tener 9 caracteres: DNI (8 cifras y letra), NIE (X, Y o Z, 7 cifras y letra) o CIF (letra, 7 cifras y control).",
  tax_id_control:
    "El NIF, NIE o CIF no es válido: la letra o el dígito de control no coincide. Revisa que esté bien escrito.",
};

export const SAAS_BILLING_DETAILS_ERROR_CODES: Record<SaasBillingDetailsRejection, string> = {
  billing_details_required: "SAAS_BILLING_DETAILS_REQUIRED",
  legal_name_required: "SAAS_BILLING_LEGAL_NAME_REQUIRED",
  legal_name_invalid: "SAAS_BILLING_LEGAL_NAME_INVALID",
  tax_id_required: "SAAS_BILLING_TAX_ID_REQUIRED",
  tax_id_format: "SAAS_BILLING_TAX_ID_INVALID",
  tax_id_control: "SAAS_BILLING_TAX_ID_INVALID",
};

/** Espacios colapsados y recortados. */
export function normalizeBillingLegalName(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

type LegalNameRejection = Extract<SaasBillingDetailsRejection, `legal_name_${string}`>;
type TaxIdRejection = Extract<SaasBillingDetailsRejection, `tax_id_${string}`>;

/** Razón social normalizada o el motivo de rechazo. */
export function checkBillingLegalName(
  value: string
): { ok: true; legalName: string } | { ok: false; reason: LegalNameRejection } {
  // Los saltos de línea y caracteres de control se rechazan antes de normalizar.
  if (hasControlCharacter(value)) return { ok: false, reason: "legal_name_invalid" };
  const legalName = normalizeBillingLegalName(value);
  if (legalName.length === 0) return { ok: false, reason: "legal_name_required" };
  if (legalName.length < 2 || legalName.length > SAAS_BILLING_LEGAL_NAME_MAX_LENGTH) {
    return { ok: false, reason: "legal_name_invalid" };
  }
  return { ok: true, legalName };
}

/** NIF canónico y su tipo, o el motivo de rechazo. */
export function checkBillingTaxId(
  value: string
):
  | { ok: true; taxId: string; kind: SpanishTaxIdKind }
  | { ok: false; reason: TaxIdRejection } {
  const check = checkSpanishTaxId(value);
  if (check.valid) return { ok: true, taxId: check.value, kind: check.kind };
  return {
    ok: false,
    reason:
      check.reason === "empty"
        ? "tax_id_required"
        : check.reason === "format"
          ? "tax_id_format"
          : "tax_id_control",
  };
}

export function parseSaasCustomerBillingDetails(
  input: SaasCustomerBillingDetailsInput | null | undefined
):
  | { ok: true; details: SaasCustomerBillingDetails }
  | { ok: false; reason: SaasBillingDetailsRejection } {
  if (!input) return { ok: false, reason: "billing_details_required" };
  const legalName = checkBillingLegalName(input.legalName);
  if (!legalName.ok) return legalName;
  const taxId = checkBillingTaxId(input.taxId);
  if (!taxId.ok) return taxId;
  return {
    ok: true,
    details: { legalName: legalName.legalName, taxId: taxId.taxId, taxIdKind: taxId.kind },
  };
}

export type InvoiceCustomerTaxIdIssue =
  /** La factura no lleva ningún NIF del cliente. */
  | "missing"
  /** Lleva varios: FacturaDirecta no sabría cuál usar. */
  | "multiple"
  /** Lleva un NIF español (`es_cif` o `eu_vat` con prefijo ES) con control incorrecto. */
  | "invalid_spanish_tax_id"
  /** Lleva un NIF que no es español (otro tipo u otro prefijo de IVA). */
  | "not_spanish";

/**
 * Revisa el NIF que Stripe copió en una factura pagada (`customer_tax_ids`).
 * Devuelve null si hay exactamente un NIF español válido. Nunca devuelve el
 * valor: el resultado se registra en alertas sin datos personales.
 */
export function auditInvoiceCustomerTaxIds(
  invoice: Record<string, unknown>
): InvoiceCustomerTaxIdIssue | null {
  const raw = invoice.customer_tax_ids;
  if (!Array.isArray(raw) || raw.length === 0) return "missing";
  if (raw.length > 1) return "multiple";
  const entry = raw[0] as { type?: unknown; value?: unknown } | null;
  const type = typeof entry?.type === "string" ? entry.type : null;
  const value = typeof entry?.value === "string" ? entry.value : null;
  if (!type || !value) return "missing";
  if (type === SPANISH_STRIPE_TAX_ID_TYPE) {
    return checkSpanishTaxId(value).valid ? null : "invalid_spanish_tax_id";
  }
  if (type === "eu_vat") {
    const compact = value.toUpperCase().replace(/[\s.-]/gu, "");
    if (!compact.startsWith("ES")) return "not_spanish";
    return checkSpanishTaxId(compact).valid ? null : "invalid_spanish_tax_id";
  }
  return "not_spanish";
}
