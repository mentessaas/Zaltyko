/**
 * ZAL-160 [GTM-DEP.4] — Storage default-deny de consent (stub).
 *
 * Implementación por defecto hasta que ZAL-156.2 ["consent gate tracking"]
 * entregue el storage canónico. Mantiene la API mínima que el contrato
 * `state.ts` espera, así que el reemplazo de ZAL-156.2 no toca a los
 * consumidores (`trackPageView`, `usePageTracking`, futuros banners de
 * cookies).
 *
 * Decisiones de diseño:
 *   - Default "unset" (no "denied") para distinguir "todavía no optó" de
 *     "optó por denegar". Los dos se tratan igual para el gate de analytics
 *     (ambos descartan), pero el UI puede mostrarlos distinto.
 *   - Persistencia en localStorage con clave versionada (`v1`) para poder
 *     migrar sin pisar consentimientos previos si cambia el contrato.
 *   - Listeners en memoria (no storage events). Suficiente para una sola
 *     pestaña; si en el futuro se necesita sync entre pestañas, se añade
 *     un listener de `storage` event en este mismo módulo.
 *   - SSR-safe: si `window` no existe, devuelve "unset" y no opera.
 */

import type {
  ConsentListener,
  ConsentSnapshot,
  ConsentValue,
} from "./state";

const STORAGE_KEY = "zaltyko.consent.v1";
const DEFAULT_SNAPSHOT: ConsentSnapshot = { value: "unset", updatedAt: 0 };

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function safeGetStorage(): Storage | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage;
  } catch {
    // Modo privado o storage bloqueado: tratamos como no-disponible.
    return null;
  }
}

function readRaw(storage: Storage | null): ConsentValue {
  if (!storage) return "unset";
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === "granted" || raw === "revoked") return raw;
    return "unset";
  } catch {
    return "unset";
  }
}

/**
 * Lee el snapshot actual. Server-side siempre devuelve "unset" (default deny).
 */
export function readConsent(): ConsentSnapshot {
  if (!isBrowser()) return { ...DEFAULT_SNAPSHOT };
  const storage = safeGetStorage();
  const value = readRaw(storage);
  return { value, updatedAt: Date.now() };
}

// --- listener registry (in-memory, single tab) -----------------------------

const listeners = new Set<ConsentListener>();

/**
 * Suscribe a cambios. Dispara el callback una vez con el snapshot actual
 * (idempotente: el que se suscribe puede asumir que ya vio el estado real)
 * y luego en cada `writeConsent`.
 */
export function subscribeConsent(listener: ConsentListener): () => void {
  listeners.add(listener);
  // Empuja el snapshot actual de inmediato (módulo cargado en cliente).
  try {
    listener(readConsent());
  } catch {
    // nunca rompemos la suscripción por un listener que falla
  }
  return () => {
    listeners.delete(listener);
  };
}

function notify(snapshot: ConsentSnapshot): void {
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // swallow: un listener que rompe no debe tumbar a los demás
    }
  }
}

/**
 * Escribe el estado y notifica a los listeners. Pensado para el banner
 * de cookies o el flujo de onboarding owner (donde se captura el opt-in).
 *
 * Pasar "unset" purga el storage (útil para "reset" en dev/QA).
 */
export function writeConsent(value: ConsentValue): ConsentSnapshot {
  if (!isBrowser()) return { ...DEFAULT_SNAPSHOT };
  const storage = safeGetStorage();
  try {
    if (value === "unset") {
      storage?.removeItem(STORAGE_KEY);
    } else {
      storage?.setItem(STORAGE_KEY, value);
    }
  } catch {
    // storage lleno o deshabilitado: persistimos en memoria via listeners
    // igual, aunque no sobrevivan a un reload.
  }
  const snapshot: ConsentSnapshot = { value, updatedAt: Date.now() };
  notify(snapshot);
  return snapshot;
}
