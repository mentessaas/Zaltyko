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

export const FAMILY_AUTOMATIC_SEPA_COLLECTION_FLAG_ENV = "ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED";

/**
 * Domiciliación (SEPA) en el cobro automático. Decisión de Elvis del 17-11-2026
 * («Primero solo tarjeta»): apagada por defecto y solo el texto exacto "true"
 * la enciende (se enciende con la Fase 4). Apagada, nunca se crea un cobro
 * nuevo por domiciliación: las cuotas de una familia que paga así se cobran a
 * mano, con recordatorios. Las domiciliaciones que ya están en el banco se
 * siguen leyendo y registrando, y la familia puede seguir guardando su orden
 * de domiciliación (Fase 2). Solo cuenta junto a
 * ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED: sola no cobra nada.
 */
export function isFamilyAutomaticSepaCollectionFlagEnabled(): boolean {
  return process.env[FAMILY_AUTOMATIC_SEPA_COLLECTION_FLAG_ENV] === "true";
}
