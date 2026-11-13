/** Commercial availability is independent of administrative onboarding. */
export type CommercialMarketCode = "ES" | "MX";

export interface CommercialMarketCapability {
  countryCode: CommercialMarketCode;
  label: string;
  liveSaasCheckoutEnabled: boolean;
}

export const COMMERCIAL_MARKET_REGISTRY = {
  ES: {
    countryCode: "ES",
    label: "España",
    liveSaasCheckoutEnabled: true,
  },
  MX: {
    countryCode: "MX",
    label: "México",
    liveSaasCheckoutEnabled: false,
  },
} as const satisfies Record<CommercialMarketCode, CommercialMarketCapability>;

/** Unknown countries remain closed for Live contracting until reviewed. */
export function isCommercialMarketLiveCheckoutEnabled(
  countryCode: string
): boolean {
  if (
    !Object.prototype.hasOwnProperty.call(
      COMMERCIAL_MARKET_REGISTRY,
      countryCode
    )
  ) {
    return false;
  }

  return COMMERCIAL_MARKET_REGISTRY[
    countryCode as CommercialMarketCode
  ].liveSaasCheckoutEnabled;
}

/**
 * Aviso para la pantalla del plan cuando la contratación Live no está abierta
 * en el país de la academia. No habilita ningún cobro: solo explica por qué
 * los botones de contratación no están disponibles y que Free sigue activo.
 */
export function commercialMarketCheckoutNotice(
  countryCode: string,
  countryName: string
): string | null {
  if (isCommercialMarketLiveCheckoutEnabled(countryCode)) return null;
  return `La contratación de planes de pago para academias de ${countryName} todavía no está disponible; llegará más adelante. Mientras tanto, tu academia puede seguir usando Zaltyko con el plan Free y sus límites. Si necesitas más capacidad, escríbenos desde Contacto.`;
}

/**
 * Territorio fiscal de una academia de España. Solo Península y Baleares
 * están dentro del territorio de aplicación del IVA; Canarias (IGIC), Ceuta y
 * Melilla (IPSI) necesitan una fiscalidad que todavía no está preparada.
 */
export const SPANISH_TAX_TERRITORIES = [
  "peninsula_baleares",
  "canarias",
  "ceuta",
  "melilla",
] as const;
export type SpanishTaxTerritory = (typeof SPANISH_TAX_TERRITORIES)[number];

export const SPANISH_TAX_TERRITORY_LABELS: Record<SpanishTaxTerritory, string> = {
  peninsula_baleares: "Península o Islas Baleares",
  canarias: "Islas Canarias",
  ceuta: "Ceuta",
  melilla: "Melilla",
};

export function isSpanishTaxTerritory(value: unknown): value is SpanishTaxTerritory {
  return (
    typeof value === "string" &&
    (SPANISH_TAX_TERRITORIES as readonly string[]).includes(value)
  );
}

/** Únicos territorios con contratación de pago: dentro del IVA español. */
export function isSpanishTaxTerritoryCheckoutCovered(
  territory: SpanishTaxTerritory
): boolean {
  return territory === "peninsula_baleares";
}

/**
 * Aviso para la pantalla del plan cuando la sede fiscal de una academia de
 * España queda fuera del IVA. Igual que el aviso de país: no habilita ningún
 * cobro y recuerda que Free sigue activo.
 */
export function spanishTaxTerritoryCheckoutNotice(
  territory: SpanishTaxTerritory
): string | null {
  if (isSpanishTaxTerritoryCheckoutCovered(territory)) return null;
  return `La contratación de planes de pago para academias con sede fiscal en ${SPANISH_TAX_TERRITORY_LABELS[territory]} todavía no está disponible: allí no se aplica el IVA y su fiscalidad aún no está preparada. Mientras tanto, tu academia puede seguir usando Zaltyko con el plan Free y sus límites. Si necesitas más capacidad, escríbenos desde Contacto.`;
}
