import {
  isSpanishTaxTerritoryCheckoutCovered,
  type SpanishTaxTerritory,
} from "@/modules/organizations/domain/commercial-market-capabilities";

/**
 * Contrato fiscal de Checkout SaaS para academias de España.
 *
 * Los precios aprobados son base sin IVA (Starter 19 €/190 €, Growth
 * 49 €/490 €). Para Península y Baleares se repercute el tipo general del
 * 21 % sobre la base mediante un Tax Rate de Stripe exclusivo (no incluido en
 * el precio) creado por Elvis y referenciado por variable de entorno. No se
 * usa Stripe Tax (automatic_tax): el tipo y el territorio quedan fijados aquí
 * y se comprueban en cada sesión.
 */
export const SPANISH_VAT_GENERAL_RATE_PERCENT = 21;

export interface SpanishVatQuote {
  baseCents: number;
  taxCents: number;
  totalCents: number;
  ratePercent: typeof SPANISH_VAT_GENERAL_RATE_PERCENT;
}

/** Cuota de IVA redondeada al céntimo, como la calcula Stripe por línea. */
export function quoteSpanishVat(baseCents: number): SpanishVatQuote {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0) {
    throw new RangeError("La base imponible debe ser un entero de céntimos no negativo");
  }
  const taxCents = Math.round((baseCents * SPANISH_VAT_GENERAL_RATE_PERCENT) / 100);
  return {
    baseCents,
    taxCents,
    totalCents: baseCents + taxCents,
    ratePercent: SPANISH_VAT_GENERAL_RATE_PERCENT,
  };
}

const euroExact = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** «22,99 €»: importes con IVA siempre con dos decimales. */
export function formatEuroCentsExact(cents: number): string {
  return euroExact.format(cents / 100);
}

export type SaasCheckoutTaxPlan =
  /** Sin impuesto: solo Stripe test sin tax rate, otro país en test o el ensayo QA congelado. */
  | { kind: "none" }
  /** IVA general español sobre la base con el Tax Rate configurado. */
  | { kind: "es_vat_general"; taxRateReference: string }
  /** Live sin Tax Rate configurado: la contratación no se abre. */
  | { kind: "configuration_unavailable" }
  /** Live fuera de España: lo rechaza antes el registro de mercados. */
  | { kind: "market_not_covered" }
  /** Academia de España sin territorio fiscal declarado. */
  | { kind: "territory_required" }
  /** Canarias, Ceuta o Melilla: fuera del IVA, sin contratación. */
  | { kind: "territory_not_covered"; territory: SpanishTaxTerritory };

/**
 * Decide qué contrato fiscal aplica a una nueva sesión de Checkout. Es una
 * función pura: el servicio la llama antes de bloquear o escribir nada en
 * base de datos o en Stripe y convierte cada rechazo en un error sin efectos.
 */
export function resolveSaasCheckoutTaxPlan(input: {
  environment: "test" | "live";
  countryCode: string;
  taxTerritory: SpanishTaxTerritory | null | undefined;
  taxRateReference: string | null | undefined;
  frozenQaExperiment: boolean;
}): SaasCheckoutTaxPlan {
  // El ensayo remoto congelado conserva su payload exacto (solo existe en test).
  if (input.frozenQaExperiment && input.environment === "test") return { kind: "none" };

  const taxRateReference = input.taxRateReference?.trim() || null;
  if (input.environment === "live") {
    if (!taxRateReference) return { kind: "configuration_unavailable" };
    if (input.countryCode !== "ES") return { kind: "market_not_covered" };
  } else if (!taxRateReference || input.countryCode !== "ES") {
    // Stripe test sigue abierto para todos los países; sin tax rate de test
    // el recorrido es el anterior, sin impuesto, y no sirve para verificar IVA.
    return { kind: "none" };
  }

  if (!input.taxTerritory) return { kind: "territory_required" };
  if (!isSpanishTaxTerritoryCheckoutCovered(input.taxTerritory)) {
    return { kind: "territory_not_covered", territory: input.taxTerritory };
  }
  return { kind: "es_vat_general", taxRateReference: taxRateReference! };
}

/**
 * Comprueba que la sesión creada por Stripe cobra exactamente base + 21 %.
 * Si el Tax Rate no se aplicó o tiene otro porcentaje, la sesión no se entrega.
 */
export function checkoutSessionMatchesSpanishVat(
  session: {
    amount_subtotal?: number | null;
    amount_total?: number | null;
    total_details?: { amount_tax?: number | null; amount_discount?: number | null } | null;
  },
  quote: SpanishVatQuote
): boolean {
  return (
    session.amount_subtotal === quote.baseCents &&
    session.amount_total === quote.totalCents &&
    session.total_details?.amount_tax === quote.taxCents &&
    (session.total_details?.amount_discount ?? 0) === 0
  );
}
