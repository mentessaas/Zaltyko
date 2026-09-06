/**
 * Google Ads conversion tracking — helper puro, importable desde client y server.
 *
 * En server-side (webhook handlers, route handlers) solo funciona si hay un
 * navegador que pueda recibir el ping (no es el caso aquí). Por tanto la
 * utilidad real es client-side. Esta versión exporta la función sin
 * dependencias de DOM, lista para ser importada desde cualquier lado.
 *
 * Para emitir conversiones server-side desde Stripe webhook:
 * - Stripe -> Zaltyko webhook procesa evento subscription_activated.
 * - `subscription_activated` ya queda registrado en `growth_events` (first-party).
 * - Para que Google Ads optimice por conversión, basta con tener configurada
 *   la importación offline de conversiones (Google Ads → Tools →
 *   Conversions → Upload conversions) que conecta `subscription_activated`
 *   con el label de Google Ads. No requiere gtag en el webhook.
 *
 * Uso client-side (recomendado para micro-conversiones como `signup_completed`):
 *   import { trackGoogleAdsConversion } from "@/components/GoogleAdsTracking";
 *   trackGoogleAdsConversion("signup_completed_label");
 */

const ADS_ID =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? ""
    : "";
const ENABLED = ADS_ID.length > 0;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function isGoogleAdsEnabled(): boolean {
  return ENABLED;
}

export function trackGoogleAdsConversion(
  conversionLabel: string,
  value?: number,
  currency: string = "EUR",
  transactionId?: string,
): void {
  if (typeof window === "undefined" || !ENABLED) return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", "conversion", {
    send_to: `${ADS_ID}/${conversionLabel}`,
    value,
    currency,
    transaction_id: transactionId,
  });
}
