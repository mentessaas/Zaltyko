/**
 * Pago automático de cuotas (cobro automático, Fase 2): lectura del entorno.
 * Solo lee variables; la decisión de disponibilidad es pura y vive en
 * domain/availability.ts. Los dos cerrojos de Live y producción son los
 * mismos que los de Conectar Stripe (Fase 1).
 */
export {
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/payments-connect/application/config";

export const FAMILY_PAYMENT_METHODS_FLAG_ENV = "ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED";

/** Apagada por defecto: solo el texto exacto "true" la enciende. */
export function isFamilyPaymentMethodsFlagEnabled(): boolean {
  return process.env[FAMILY_PAYMENT_METHODS_FLAG_ENV] === "true";
}
