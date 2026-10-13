/**
 * ZAL-156.2 [GTM-DEP.2] — Storage canónico de consent (default-deny).
 *
 * Implementación de referencia para el contrato de `state.ts`. Persiste
 * `granted` / `revoked` / `unset` (default) en `localStorage` con clave
 * versionada y sincroniza entre pestañas vía el evento `storage` de
 * Window. Cualquier productor de UI (banner de cookies, ajustes de
 * cuenta) escribe con `writeConsent()`; los consumidores de gating
 * (`trackPageView`, `usePageTracking`) leen vía `state.ts`.
 *
 * Decisiones de diseño:
 *
 *   - Default "unset" (no "denied") para distinguir "todavía no optó" de
 *     "optó por denegar". Los dos se tratan igual para el gate de
 *     analytics (ambos descartan), pero el UI puede mostrarlos distinto.
 *   - Persistencia en localStorage con clave versionada (`v1`) para
 *     poder migrar sin pisar consentimientos previos si cambia el
 *     contrato. La versión está en la propia clave, no en el valor, así
 *     que un cambio de versión se detecta por clave ausente y se trata
 *     como "unset" automáticamente.
 *   - Sincronización entre pestañas del mismo origen vía `storage`
 *     event. El evento `storage` se dispara en TODAS las pestañas
 *     excepto la que escribió; el writer local notifica por su cuenta
 *     en `writeConsent`. La sincronización cubre los tres estados
 *     (`granted` / `revoked` / `unset`, este último vía `removeItem`).
 *   - Listeners en memoria (registry `Set<ConsentListener>`). Suficiente
 *     para notificar a los consumidores suscritos al cambio.
 *   - SSR-safe: si `window` no existe, devuelve "unset" y no opera. La
 *     suscripción al `storage` event se hace perezosamente la primera
 *     vez que alguien invoca `readConsent` / `writeConsent` /
 *     `subscribeConsent` en cliente (vía `ensureBrowserBindings()`).
 *   - Storage corrupto o con valor no reconocido → "unset" (defensa).
 *   - Se exporta `__resetConsentForTests()` solo bajo `process.env`
 *     `NODE_ENV !== "production"` para resetear el listener registry y
 *     el `storage` subscription entre tests; el consumer real nunca
 *     llama a esta función.
 */

import type { ConsentListener, ConsentSnapshot, ConsentValue } from "./state";

const STORAGE_KEY = "zaltyko.consent.v1";
const DEFAULT_SNAPSHOT: ConsentSnapshot = { value: "unset", updatedAt: 0 };

// --- browser gating (SSR-safe) ---------------------------------------------

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
    return parseConsentValue(storage.getItem(STORAGE_KEY));
  } catch {
    return "unset";
  }
}

function parseConsentValue(raw: string | null): ConsentValue {
  return raw === "granted" || raw === "revoked" ? raw : "unset";
}

// --- listener registry (in-memory) -----------------------------------------

const listeners = new Set<ConsentListener>();
let storageBindingInstalled = false;
let storageBindingWindow: Window | null = null;
let volatileSnapshot: ConsentSnapshot | null = null;

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;

  const storage = safeGetStorage();
  if (event.storageArea && storage && event.storageArea !== storage) return;

  const value =
    event.key === null ? "unset" : parseConsentValue(event.newValue);
  const snapshot: ConsentSnapshot = { value, updatedAt: Date.now() };
  volatileSnapshot = snapshot;
  notify(snapshot);
}

function ensureBrowserBindings(): void {
  if (!isBrowser() || storageBindingInstalled) return;
  storageBindingInstalled = true;
  storageBindingWindow = window;
  // El `storage` event se dispara en pestañas distintas a la que escribió.
  // `key === null` representa `localStorage.clear()` y también debe revocar.
  // Conservamos la ventana y el handler para poder retirarlo en tests.
  const target = window;
  storageBindingWindow = target;
  target.addEventListener("storage", handleStorageEvent);
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

// --- public API ------------------------------------------------------------

/**
 * Lee el snapshot actual. Server-side siempre devuelve "unset" (default
 * deny). En cliente, dispara la instalación perezosa del binding al
 * `storage` event.
 */
export function readConsent(): ConsentSnapshot {
  if (!isBrowser()) return { ...DEFAULT_SNAPSHOT };
  ensureBrowserBindings();
  if (volatileSnapshot) return { ...volatileSnapshot };
  const storage = safeGetStorage();
  const value = readRaw(storage);
  return { value, updatedAt: Date.now() };
}

/**
 * Suscribe a cambios. Dispara el callback una vez con el snapshot
 * actual (idempotente: el que se suscribe puede asumir que ya vio el
 * estado real) y luego en cada `writeConsent` o evento `storage` desde
 * otra pestaña. Devuelve la función de desuscripción.
 */
export function subscribeConsent(listener: ConsentListener): () => void {
  listeners.add(listener);
  ensureBrowserBindings();
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

/**
 * Escribe el estado y notifica a los listeners locales. Pensado para
 * el banner de cookies o el flujo de onboarding owner (donde se captura
 * el opt-in). Las pestañas del mismo origen se sincronizan vía el
 * evento `storage` (ver `ensureBrowserBindings`).
 *
 * Pasar "unset" purga el storage (útil para "reset" en dev/QA). Si
 * storage no está disponible, los listeners aún reciben el snapshot en
 * memoria aunque no sobreviva a un reload.
 */
export function writeConsent(value: ConsentValue): ConsentSnapshot {
  if (!isBrowser()) return { ...DEFAULT_SNAPSHOT };
  ensureBrowserBindings();
  const storage = safeGetStorage();
  const snapshot: ConsentSnapshot = { value, updatedAt: Date.now() };
  let persisted = false;
  try {
    if (storage) {
      if (value === "unset") {
        storage.removeItem(STORAGE_KEY);
      } else {
        storage.setItem(STORAGE_KEY, value);
      }
      persisted = true;
    }
  } catch {
    // Mantiene la última elección explícita en memoria; sin elección previa,
    // un storage bloqueado sigue leyendo como unset (default-deny).
  }
  volatileSnapshot = persisted ? null : snapshot;
  notify(snapshot);
  return snapshot;
}

// --- test hook -------------------------------------------------------------

/**
 * Resetea el listener registry y desinstala el binding de `storage`.
 * Solo disponible en no-producción. Pensado para `beforeEach` en tests
 * que montan y desmontan muchas veces.
 */
export function __resetConsentForTests(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__resetConsentForTests is not available in production");
  }
  storageBindingWindow?.removeEventListener("storage", handleStorageEvent);
  storageBindingWindow = null;
  listeners.clear();
  storageBindingInstalled = false;
  volatileSnapshot = null;
}
