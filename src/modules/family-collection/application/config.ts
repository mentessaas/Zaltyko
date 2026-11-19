/**
 * Cobro automático de cuotas (Fase 3): lectura del entorno. Solo lee
 * variables; las decisiones son puras y viven en domain/. Los dos cerrojos de
 * Live y producción son los mismos que los de Conectar Stripe (Fase 1).
 */
import {
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/payments-connect/application/config";

export { isProductionDatabase, resolveConnectEnvironment };

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

export const FAMILY_COLLECTION_EVENTS_FLAG_ENV = "ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED";

/**
 * Eventos de Stripe de los cobros a familias (Fase 4): la ruta
 * /api/stripe/connect/payments-webhook y todo lo que cuelga de ella. Apagada
 * por defecto y solo el texto exacto "true" la enciende. Aun encendida, solo
 * actúa con clave de prueba de Stripe, fuera de la base de producción y con
 * el almacenamiento de las Fases 1–4 presente.
 */
export function isFamilyCollectionEventsFlagEnabled(): boolean {
  return process.env[FAMILY_COLLECTION_EVENTS_FLAG_ENV] === "true";
}

/**
 * Fase 4 (Tarea 5): la familia puede confirmar con su banco, desde
 * /familia/cuotas, un cobro de tarjeta que espera en `requires_action`. Solo
 * se lee el entorno (sin base): la bandera del cobro, la de los eventos, la
 * clave de prueba de Stripe y una base que no es la de producción. Quien
 * llama comprueba además el almacenamiento con la forma "phase4".
 */
export function isFamilyPaymentConfirmationOpen(): boolean {
  return (
    isFamilyAutomaticCollectionFlagEnabled() &&
    isFamilyCollectionEventsFlagEnabled() &&
    resolveConnectEnvironment() === "test" &&
    !isProductionDatabase()
  );
}

export const FAMILY_COLLECTION_RECEIPTS_FLAG_ENV = "ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED";

/**
 * Fase 4 (Tarea 9, D6: «Sí, apagado hasta abogado»): justificante de pago a la
 * familia por correo y en una página imprimible («no es factura», sin
 * numeración). Apagada por defecto y solo el texto exacto "true" la enciende;
 * no se enciende con familias reales sin la respuesta del gestor (L6).
 * Apagada: al registrar un cobro no se escribe el evento del justificante, no
 * se envía ningún correo, la página responde 404 y el portal no enseña el
 * enlace. Encenderla no envía justificantes de cobros anteriores: el evento
 * solo se escribe al registrar el cobro.
 */
export function isFamilyCollectionReceiptsFlagEnabled(): boolean {
  return process.env[FAMILY_COLLECTION_RECEIPTS_FLAG_ENV] === "true";
}
