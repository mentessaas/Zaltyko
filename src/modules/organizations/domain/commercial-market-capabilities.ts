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
