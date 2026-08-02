/**
 * ZAL-157 [GTM-DEP.1] — UTM capture client-side.
 *
 * Regla de captura first-touch:
 *   1. LANDING (primer page view): si la URL trae utm_*, persistir en
 *      sessionStorage sin sobrescribir si ya existe.
 *   2. NAVEGACIÓN INTERNA: sessionStorage preserva UTMs toda la sesión.
 *   3. SIGNUP (/onboarding/owner): leer con precedencia
 *      sessionStorage > URL params. URL gana si llega directo sin sesión
 *      previa (cold start con UTMs en la URL del signup).
 *
 * Naming: snake_case, minúsculas, sin espacios (regla Hermin §4).
 * Taxonomía: ver `canal.ts` para la resolución utm_source -> canal.
 */

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];

export const SESSION_STORAGE_KEY = "zaltyko.utm.v1";
const LANDING_PATH_KEY = "zaltyko.utm_landing.v1";

export interface CapturedUtm {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  utm_landing_path: string;
}

const MAX_VALUE_LENGTH = 200;

function normalize(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // snake_case: colapsa espacios y caracteres no permitidos a "_".
  const sanitized = trimmed
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-./]/g, "")
    .slice(0, MAX_VALUE_LENGTH);
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Lee los UTMs presentes en una URL (window.location.search).
 * Devuelve solo los que pasan normalización; omite los vacíos.
 */
export function readUtmFromUrl(search: string | URLSearchParams): Partial<CapturedUtm> {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const out: Partial<CapturedUtm> = {};
  for (const key of UTM_KEYS) {
    const normalized = normalize(params.get(key));
    if (normalized) {
      out[key] = normalized;
    }
  }
  return out;
}

function hasAnyUtm(record: Partial<CapturedUtm>): boolean {
  return UTM_KEYS.some((k) => typeof record[k] === "string" && record[k]!.length > 0);
}

/**
 * Lee el state actual en sessionStorage. Devuelve {} si no hay nada o si
 * el storage no está disponible (SSR, modo privado en algunos browsers).
 */
export function readStoredUtm(storage?: Storage | null): Partial<CapturedUtm> {
  if (typeof window === "undefined") return {};
  const store = storage ?? window.sessionStorage;
  if (!store) return {};
  try {
    const raw = store.getItem(SESSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<CapturedUtm>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredUtm(
  record: Partial<CapturedUtm>,
  storage?: Storage | null
): void {
  if (typeof window === "undefined") return;
  const store = storage ?? window.sessionStorage;
  if (!store) return;
  try {
    store.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // sessionStorage lleno o deshabilitado: no bloqueamos la captura,
    // solo perdemos persistencia entre page views.
  }
}

/**
 * Captura UTMs de la URL actual, mergea con sessionStorage (first-touch:
 * sessionStorage gana para preservar el primer touch), guarda el landing
 * path si aún no estaba registrado y devuelve el resultado.
 *
 * Pensado para llamarse en el mount del layout público y en el onboarding
 * owner. Es idempotente dentro de la misma sesión.
 */
export function captureUtm(
  options: {
    search?: string | URLSearchParams;
    path?: string;
    storage?: Storage | null;
  } = {}
): Partial<CapturedUtm> {
  const search = options.search ?? (typeof window !== "undefined" ? window.location.search : "");
  const path =
    options.path ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  const storage = options.storage ?? (typeof window !== "undefined" ? window.sessionStorage : null);

  const fromUrl = readUtmFromUrl(search);
  const existing = readStoredUtm(storage);

  // First-touch: si la sesión ya tiene UTMs, los respetamos aunque la URL
  // actual traiga otros (caso típico: entró por landing con UTMs, navegó
  // hasta /pricing?gclid=X, /pricing?gclid=Y -> el primero gana).
  const merged: Partial<CapturedUtm> = { ...fromUrl, ...existing };

  if (hasAnyUtm(merged)) {
    // Resolvemos el landing path ANTES de persistir: si la sesión ya tiene
    // un landing path registrado, lo respetamos (first-touch); si no, fijamos
    // el path actual como el landing. Lo hacemos antes de writeStoredUtm
    // para que el JSON principal lleve siempre el path correcto y
    // `readStoredUtm` lo devuelva sin depender de la clave auxiliar.
    try {
      const previousLanding = storage?.getItem(LANDING_PATH_KEY);
      if (previousLanding) {
        merged.utm_landing_path = previousLanding;
      } else if (path) {
        merged.utm_landing_path = path;
        storage?.setItem(LANDING_PATH_KEY, path);
      }
    } catch {
      // ignore
    }

    writeStoredUtm(merged, storage);
  }

  return merged;
}

/**
 * Lee los UTMs a enviar al backend en el signup. Precedencia:
 *   1. Argumento explícito (útil para el claim path que no navega por
 *      landing sino directo a /onboarding/owner).
 *   2. sessionStorage (first-touch de toda la sesión).
 *   3. URL actual del signup (cold start con UTMs en la URL del signup).
 *
 * Devuelve `null` si no hay UTMs en ninguna fuente (registro "direct" —
 * sin atribución, lo cual es esperado y se trata como tal en ZAL-159).
 */
export function readUtmForSignup(
  options: {
    explicit?: Partial<CapturedUtm> | null;
    search?: string | URLSearchParams;
    storage?: Storage | null;
  } = {}
): Partial<CapturedUtm> | null {
  const fromStorage = readStoredUtm(options.storage);
  const fromSearch = readUtmFromUrl(
    options.search ?? (typeof window !== "undefined" ? window.location.search : "")
  );
  const merged: Partial<CapturedUtm> = {
    ...fromSearch,
    ...fromStorage,
    ...(options.explicit ?? {}),
  };
  return hasAnyUtm(merged) ? merged : null;
}

/**
 * Limpia el storage al terminar el signup exitoso. Evita que el siguiente
 * signup del mismo navegador herede UTMs de la sesión anterior.
 */
export function clearStoredUtm(storage?: Storage | null): void {
  if (typeof window === "undefined") return;
  const store = storage ?? window.sessionStorage;
  if (!store) return;
  try {
    store.removeItem(SESSION_STORAGE_KEY);
    store.removeItem(LANDING_PATH_KEY);
  } catch {
    // ignore
  }
}