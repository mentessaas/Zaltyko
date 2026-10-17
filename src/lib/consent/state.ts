/**
 * ZAL-156.2 [GTM-DEP.2] — Contrato read-only del estado de consent de analytics.
 *
 * El gate de `page_view` consume este contrato; NO persiste por su cuenta.
 * El almacenamiento canónico vive en `src/lib/consent/store.ts`
 * (default-deny, localStorage versionado, sincronizado entre pestañas vía
 * `storage` event, SSR-safe). La interfaz pública está pensada para que
 * el reemplazo del backend sea de una sola pieza sin tocar al consumidor
 * (`trackPageView`, `usePageTracking`, banner de cookies).
 *
 * Regla de precedencia (de RESEARCH/DATA_GOVERNANCE_TAXONOMY_GTM.md §5):
 *   page_view requiere consent activo. Sin consent, se descarta.
 */

import { readConsent, subscribeConsent as subscribeStore } from "./store";

export type ConsentValue = "granted" | "revoked" | "unset";

export interface ConsentSnapshot {
  /** Estado actual. "unset" = el usuario todavía no optó. */
  value: ConsentValue;
  /** Timestamp epoch ms del último cambio (para debugging/UI). */
  updatedAt: number;
}

export type ConsentListener = (snapshot: ConsentSnapshot) => void;

/**
 * Devuelve el estado actual de consent. Es síncrono y SSR-safe: server-side
 * siempre devuelve "unset" (no podemos saber qué decidió el cliente).
 *
 * Los consumidores no deben asumir "unset" como "denegado" para nada que no
 * sea gating de cookies/analytics — para esos casos es exactamente lo que
 * queremos: default deny hasta opt-in explícito.
 */
export function getConsentSnapshot(): ConsentSnapshot {
  return readConsent();
}

/**
 * Suscribe a cambios de consent. Devuelve la función de desuscripción.
 *
 * El callback se ejecuta inmediatamente con el snapshot actual (idempotente)
 * y luego en cada cambio (grant/revoke). Si el storage no está disponible
 * (SSR, modo privado en algunos browsers), no falla: simplemente no hay
 * snapshot y el callback queda esperando un próximo cambio.
 */
export function subscribeConsent(listener: ConsentListener): () => void {
  return subscribeStore(listener);
}

/**
 * Helper para los consumidores que solo necesitan el boolean "puedo
 * trackear?". Devuelve true sólo si el consent está "granted". Cubre
 * explícitamente "unset" y "revoked" como deny (regla default-deny).
 */
export function hasAnalyticsConsent(): boolean {
  return getConsentSnapshot().value === "granted";
}
