import { isCommercialMarketLiveCheckoutEnabled } from "@/modules/organizations/domain/commercial-market-capabilities";

import {
  isCanonicalSpanishPersonalTaxId,
  isPublishableSpanishPostalAddress,
  isSpanishPostalCodeOutsideVatTerritory,
  spanishPostalCodeOf,
} from "./spanish-tax-id";

/** Public seller information. Never put credentials or identity documents here. */
export interface CommercialLaunchProfile {
  legalName: string;
  countryCode: string;
  taxId: string | null;
  professionalAddress: string | null;
  supportEmail: string;
  registrationStatus: "pending" | "verified";
  /** Fecha de alta censal (AAAA-MM-DD) que figura en el modelo 036/037. */
  registrationVerifiedOn: string | null;
  supportMailboxVerified: boolean;
  taxTreatmentReviewed: boolean;
  checkoutTaxVerified: boolean;
  legalTextsApproved: boolean;
  /**
   * Cada cobro genera su factura completa de la serie «ZA» en FacturaDirecta
   * (numeración única que recibe la gestoría). Stripe no emite facturas al
   * cliente; puede ser un paso manual al principio, pero debe existir antes
   * del primer cliente real.
   */
  invoicingIntegrationReady: boolean;
  liveReleaseApproved: boolean;
}

// Declaración humana, 26-10-2026: futuro autónomo en España.
// Actualización 12-11-2026: Elvis confirma que ya está dado de alta como
// autónomo en España y vende como persona física con este nombre.
// Actualización 13-11-2026 (sesión de finanzas con su gestor): alta en
// Hacienda y RETA el 05-11-2026, confirmada por documento; domicilio
// profesional en Península o Baleares.
// Rellenar los datos de identidad no abre cobros ni acredita la fiscalidad:
// cada bandera booleana se marca por separado (ver
// docs/deployment/spain-seller-activation-2026-10-26.md).
export const commercialLaunchProfile: Readonly<CommercialLaunchProfile> = {
  legalName: "Elvis Valdes Inerarte",
  countryCode: "ES",
  // ELVIS: escribe aquí tu NIF. Sustituye null por el NIF entre comillas,
  // en mayúsculas y sin espacios, puntos ni guiones: 8 cifras + letra
  // (DNI) o X/Y/Z + 7 cifras + letra (NIE). Forma: taxId: "NNNNNNNNL",
  // CI comprueba la letra de control y falla si está mal escrita.
  taxId: null,
  // ELVIS: domicilio profesional publicable. Sustituye null por la dirección
  // postal completa entre comillas, con esta forma:
  // professionalAddress: "Vía y número, piso/puerta, CP Localidad (Provincia)",
  // CI exige al menos una coma y un código postal español de 5 cifras.
  professionalAddress: null,
  supportEmail: "hola@zaltyko.com",
  // Pasa a "verified" solo en el mismo cambio en el que Elvis completa NIF y
  // domicilio; antes, la readiness lo marca como registration_incomplete.
  registrationStatus: "pending",
  // Alta censal en Hacienda y RETA confirmada por documento (13-11-2026).
  registrationVerifiedOn: "2026-11-05",
  // Claude/Elvis: true tras enviar un correo real a hola@zaltyko.com y
  // responderlo desde ese buzón.
  supportMailboxVerified: false,
  // Elvis (o su asesoría): true tras confirmar el tipo general del 21 % para
  // clientes de Península y Baleares y las reglas de factura.
  taxTreatmentReviewed: false,
  // Claude: true solo tras probar Checkout en Stripe test (staging) con el
  // tax rate de IVA y revisar la factura generada (base, 21 %, total, datos).
  checkoutTaxVerified: false,
  // Elvis: true tras aprobar Términos, Privacidad y encargo de tratamiento.
  legalTextsApproved: false,
  // Elvis/Claude: true cuando cada cobro genere su factura ZA en FacturaDirecta
  // (aunque al principio sea un procedimiento manual documentado y probado).
  invoicingIntegrationReady: false,
  // Elvis: true en el último paso, con Stripe Live y Vercel configurados.
  liveReleaseApproved: false,
};

export function getCommercialLaunchReadiness(
  profile: Readonly<CommercialLaunchProfile> = commercialLaunchProfile
): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!profile.legalName.trim()) missing.push("seller_name");
  if (profile.countryCode !== "ES") missing.push("seller_country_review");
  if (!profile.taxId?.trim()) missing.push("seller_tax_id");
  else if (!isCanonicalSpanishPersonalTaxId(profile.taxId)) missing.push("seller_tax_id_format");
  if (!profile.professionalAddress?.trim()) missing.push("seller_address");
  else if (!isPublishableSpanishPostalAddress(profile.professionalAddress)) missing.push("seller_address_format");
  else if (isSpanishPostalCodeOutsideVatTerritory(spanishPostalCodeOf(profile.professionalAddress)!)) {
    // Fuera del territorio IVA (IGIC/IPSI): el contrato de IVA peninsular no aplica.
    missing.push("seller_tax_territory_review");
  }
  if (profile.registrationStatus !== "verified") missing.push("registration");
  else if (!isIsoCalendarDate(profile.registrationVerifiedOn)) missing.push("registration_date");
  else if (!profile.taxId?.trim() || !profile.professionalAddress?.trim()) {
    // «verified» exige NIF y domicilio completos en el mismo perfil.
    missing.push("registration_incomplete");
  }
  if (!profile.supportEmail.trim() || !profile.supportMailboxVerified) missing.push("support_mailbox");
  if (!profile.taxTreatmentReviewed) missing.push("tax_treatment");
  if (!profile.checkoutTaxVerified) missing.push("checkout_tax");
  if (!profile.legalTextsApproved) missing.push("legal_texts");
  if (!profile.invoicingIntegrationReady) missing.push("invoicing_integration");
  if (!profile.liveReleaseApproved) missing.push("live_release");
  return { ready: missing.length === 0, missing };
}

/**
 * Tratamiento fiscal confirmado con la gestoría (13-11-2026). Informativo: no
 * abre nada y no sustituye a la bandera taxTreatmentReviewed.
 */
export const sellerTaxProfile = {
  /** IAE 844 (sección empresarial). */
  iaeEpigraph: "844",
  vatRegime: "general",
  vatRatePercent: 21,
  equivalenceSurcharge: false,
  cashAccountingCriterion: false,
  /** Las facturas no llevan retención de IRPF. */
  incomeTaxWithholding: false,
  /** Clubes y asociaciones sin ánimo de lucro no están exentos: 21 %. */
  nonProfitClubsExempt: false,
  /** Facturas completas en FacturaDirecta, serie única «ZA». */
  invoiceSeries: "ZA",
} as const;

function isIsoCalendarDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Test mode remains available; this gate never disables Portal or signed webhooks. */
export function isSaasCheckoutEnabled(environment: "test" | "live"): boolean {
  return environment === "test" || getCommercialLaunchReadiness().ready;
}

/** Test Checkout stays available; Live also requires an enabled buyer market. */
export function isSaasCheckoutEnabledForMarket(
  environment: "test" | "live",
  countryCode: string,
  profile: Readonly<CommercialLaunchProfile> = commercialLaunchProfile
): boolean {
  if (environment === "test") return true;
  return (
    isCommercialMarketLiveCheckoutEnabled(countryCode) &&
    getCommercialLaunchReadiness(profile).ready
  );
}
