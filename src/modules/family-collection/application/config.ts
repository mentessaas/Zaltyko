/**
 * Cobro automático de cuotas (Fase 3): lectura del entorno. Solo lee
 * variables; las decisiones son puras y viven en domain/. Los dos cerrojos de
 * Live y producción son los mismos que los de Conectar Stripe (Fase 1).
 */
export {
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/payments-connect/application/config";

export const FAMILY_AUTOMATIC_COLLECTION_FLAG_ENV = "ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED";

/** Apagada por defecto: solo el texto exacto "true" la enciende. */
export function isFamilyAutomaticCollectionFlagEnabled(): boolean {
  return process.env[FAMILY_AUTOMATIC_COLLECTION_FLAG_ENV] === "true";
}
