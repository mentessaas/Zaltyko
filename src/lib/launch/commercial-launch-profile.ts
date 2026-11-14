import { isCommercialMarketLiveCheckoutEnabled } from "@/modules/organizations/domain/commercial-market-capabilities";

import {
  isCanonicalSpanishPersonalTaxId,
  isPublishableSpanishPostalAddress,
  isSpanishPostalCodeOutsideVatTerritory,
  spanishPostalCodeOf,
} from "./spanish-tax-id";

/**
 * Public seller information. Never put credentials or identity documents here.
 *
 * Se evalúa solo en servidor: lo consumen el control de Checkout (rutas y
 * servicio de cobros) y componentes de servidor de páginas legales. NIF y
 * domicilio salen de variables de entorno del servidor (sin NEXT_PUBLIC_), que
 * Next.js nunca incrusta en los bundles de cliente.
 */
export interface CommercialLaunchProfile {
  legalName: string;
  countryCode: string;
  /** Lectura de ZALTYKO_SELLER_TAX_ID en servidor; null si falta o está vacía. */
  taxId: string | null;
  /** Lectura de ZALTYKO_SELLER_PROFESSIONAL_ADDRESS en servidor; null si falta o está vacía. */
  professionalAddress: string | null;
  supportEmail: string;
  registrationStatus: "pending" | "verified";
  /** Fecha de alta censal (AAAA-MM-DD) que figura en el modelo 036/037. */
  registrationVerifiedOn: string | null;
  supportMailboxVerified: boolean;
  /**
   * Tratamiento fiscal revisado SOLO para ventas en España (Península y
   * Baleares): IAE 844, IVA general del 21 %, sin retención de IRPF. No abre
   * ningún otro mercado: la contratación Live por país la decide
   * COMMERCIAL_MARKET_REGISTRY (hoy solo ES) y el territorio fiscal de la
   * academia (solo Península/Baleares). UE (B2B con ROI/VIES o B2C con OSS) y
   * México necesitan su propia revisión antes de habilitarse en el registro.
   */
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

/** Variables de entorno (solo servidor) con la identidad fiscal del vendedor. */
export const SELLER_TAX_ID_ENV = "ZALTYKO_SELLER_TAX_ID";
export const SELLER_PROFESSIONAL_ADDRESS_ENV = "ZALTYKO_SELLER_PROFESSIONAL_ADDRESS";

export type SellerIdentityEnvironment = Readonly<
  Partial<Record<typeof SELLER_TAX_ID_ENV | typeof SELLER_PROFESSIONAL_ADDRESS_ENV, string | undefined>>
>;

function optionalServerValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * NIF y domicilio profesional del vendedor. El repositorio es público, así que
 * NO se escriben en el código: se configuran en Vercel → proyecto `zaltyko` →
 * Settings → Environment Variables (Production) y se aplican al redesplegar.
 * Se recortan los espacios; una variable ausente o vacía cuenta como null y la
 * readiness la rechaza (`seller_tax_id`, `seller_address`). El formato lo
 * valida getCommercialLaunchReadiness (`seller_tax_id_format`,
 * `seller_address_format`, `seller_tax_territory_review`).
 */
export function readSellerIdentityFromEnvironment(
  environment: SellerIdentityEnvironment = {
    ZALTYKO_SELLER_TAX_ID: process.env.ZALTYKO_SELLER_TAX_ID,
    ZALTYKO_SELLER_PROFESSIONAL_ADDRESS: process.env.ZALTYKO_SELLER_PROFESSIONAL_ADDRESS,
  }
): Pick<CommercialLaunchProfile, "taxId" | "professionalAddress"> {
  return {
    taxId: optionalServerValue(environment[SELLER_TAX_ID_ENV]),
    professionalAddress: optionalServerValue(environment[SELLER_PROFESSIONAL_ADDRESS_ENV]),
  };
}

// Declaración humana, 26-10-2026: futuro autónomo en España.
// Actualización 12-11-2026: Elvis confirma que ya está dado de alta como
// autónomo en España y vende como persona física con este nombre.
// Actualización 13-11-2026 (sesión de finanzas con su gestor): alta en
// Hacienda y RETA el 05-11-2026, verificada con el modelo 036; domicilio
// profesional en Península o Baleares; tratamiento fiscal para España
// confirmado (IAE 844, IVA 21 %, sin retención).
// NIF y domicilio no van aquí (repositorio público): ver
// readSellerIdentityFromEnvironment. Cada bandera booleana se marca por
// separado (ver docs/deployment/spain-seller-activation-2026-10-26.md).
const declaredCommercialLaunchProfile: Readonly<
  Omit<CommercialLaunchProfile, "taxId" | "professionalAddress">
> = {
  legalName: "Elvis Valdes Inerarte",
  countryCode: "ES",
  supportEmail: "hola@zaltyko.com",
  // Alta en Hacienda y RETA verificada con el modelo 036 (13-11-2026). Mientras
  // falten las variables de NIF o domicilio, la readiness sigue rechazando con
  // seller_tax_id / seller_address y registration_incomplete.
  registrationStatus: "verified",
  registrationVerifiedOn: "2026-11-05",
  // Claude/Elvis: true tras enviar un correo real a hola@zaltyko.com y
  // responderlo desde ese buzón.
  supportMailboxVerified: false,
  // Confirmado por la sesión de finanzas con el gestor (13-11-2026) solo para
  // España: IAE 844, IVA 21 %, sin retención. No abre otros mercados.
  taxTreatmentReviewed: true,
  // Claude: true solo tras probar Checkout en Stripe test (staging) con el
  // tax rate de IVA y revisar la factura generada (base, 21 %, total, datos).
  checkoutTaxVerified: false,
  // Elvis: true tras aprobar Términos, Privacidad y encargo de tratamiento.
  legalTextsApproved: false,
  // Prueba en modo test (Stripe → n8n → borrador ZA) confirmada el 13-11-2026.
  // true solo cuando el webhook hacia n8n y la clave restringida de solo
  // lectura existan también en la cuenta Live de Stripe.
  invoicingIntegrationReady: false,
  // Elvis: true en el último paso, con Stripe Live y Vercel configurados.
  liveReleaseApproved: false,
};

/** Perfil único del vendedor, con NIF y domicilio leídos del entorno del servidor. */
export function getCommercialLaunchProfile(
  environment?: SellerIdentityEnvironment
): Readonly<CommercialLaunchProfile> {
  return Object.freeze({
    ...declaredCommercialLaunchProfile,
    ...readSellerIdentityFromEnvironment(environment),
  });
}

export function getCommercialLaunchReadiness(
  profile: Readonly<CommercialLaunchProfile> = getCommercialLaunchProfile()
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
 * Tratamiento fiscal confirmado con la gestoría (13-11-2026) para ventas en
 * España. Informativo: no abre nada y no sustituye a la bandera
 * taxTreatmentReviewed.
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
  profile: Readonly<CommercialLaunchProfile> = getCommercialLaunchProfile()
): boolean {
  if (environment === "test") return true;
  return (
    isCommercialMarketLiveCheckoutEnabled(countryCode) &&
    getCommercialLaunchReadiness(profile).ready
  );
}
