/**
 * UTM capture para atribución de canales de registro (ZAL-157).
 *
 * Reglas operativas:
 * - First-touch: el primer set de UTMs observado en la sesión persiste y NO
 *   se sobrescribe con valores posteriores. Esto preserva la atribución del
 *   landing original aunque el visitante navegue internamente.
 * - Storage: `sessionStorage` (clave por namespace) puente entre landing y
 *   `/onboarding/owner`. `localStorage` queda fuera para no contaminar
 *   atribución cross-session (cada visita tiene su propio "primer touch").
 * - Validación al ingreso: snake_case, lowercase, sin espacios, trim.
 *   Cualquier valor que no cumpla el formato se descarta silenciosamente.
 * - Sin UTM en signup → registrar `direct/none/none/none/none` para mantener
 *   trazabilidad (per spec §"Notas").
 *
 * Este módulo NO depende de DOM (tests puros), ni hace I/O. La integración
 * con `sessionStorage` se inyecta vía `storage` (testeable con stub).
 */

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];

export type UtmParams = Partial<Record<UtmKey, string | null | undefined>>;

export const UTM_STORAGE_KEY = "zaltyko_first_touch_utm";

/** Defaults de "no attribution": `direct/none/none/...` para mantener trazabilidad. */
export const UTM_DIRECT_FALLBACK: Required<Record<UtmKey, string>> = {
  utm_source: "direct",
  utm_medium: "none",
  utm_campaign: "none",
  utm_term: "none",
  utm_content: "none",
};

/**
 * Patrón aceptado por Hermin §4 + taxonomía Zaltyko:
 * lowercase, snake_case, sin espacios. Letras, dígitos, guion bajo y guion.
 * Máximo 128 chars (defensa contra payloads abusivos).
 */
const UTM_VALUE_PATTERN = /^[a-z0-9_-]+$/;
const UTM_VALUE_MAX_LENGTH = 128;

export interface UtmStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isBrowserLikeStorage(value: unknown): value is UtmStorageLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UtmStorageLike).getItem === "function" &&
    typeof (value as UtmStorageLike).setItem === "function"
  );
}

function safeStorage(storage: UtmStorageLike | undefined): UtmStorageLike | null {
  if (!storage) return null;
  if (!isBrowserLikeStorage(storage)) return null;
  try {
    // Algunos navegadores lanzan SecurityError al tocar storage en modo
    // privado o en iframes cross-origin. Probamos con setItem de un valor
    // trivial y deshacemos para verificar accesibilidad.
    const probeKey = "__zaltyko_utm_probe__";
    storage.setItem(probeKey, "1");
    storage.setItem(probeKey, "");
    return storage;
  } catch {
    return null;
  }
}

/**
 * Normaliza un valor UTM al formato Zaltyko: trim, lowercase y pattern check.
 * Devuelve `null` si el valor es vacío o no cumple el patrón.
 */
export function normalizeUtmValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered.length > UTM_VALUE_MAX_LENGTH) return null;
  if (!UTM_VALUE_PATTERN.test(lowered)) return null;
  return lowered;
}

/**
 * Extrae los 5 parámetros UTM desde una query string o un objeto.
 * Solo se aceptan valores que pasen `normalizeUtmValue`.
 */
export function pickUtmFromQuery(
  source: URLSearchParams | Record<string, string | null | undefined>
): UtmParams {
  const get = (key: UtmKey): string | null | undefined => {
    if (source instanceof URLSearchParams) return source.get(key);
    return source[key];
  };

  const out: UtmParams = {};
  for (const key of UTM_KEYS) {
    out[key] = normalizeUtmValue(get(key));
  }
  return out;
}

/**
 * Persiste UTMs en first-touch: si ya hay un valor para una key, NO se
 * sobrescribe. Devuelve el estado FINAL (merged con lo preexistente).
 *
 * Si `storage` no está disponible (SSR / private mode), el merge ocurre
 * en memoria vía `incoming` y se devuelve sin persistir.
 */
export function captureFirstTouchUtm(
  incoming: UtmParams,
  storage: UtmStorageLike | undefined,
  storageKey: string = UTM_STORAGE_KEY
): UtmParams {
  const safe = safeStorage(storage);
  const existing: UtmParams = safe
    ? readStoredUtm(safe, storageKey)
    : ({} as UtmParams);

  // First-touch: existing gana. incoming solo rellena keys que existing
  // no tiene (o que vienen vacías). NUNCA sobreescribimos un valor
  // preexistente con uno nuevo.
  const merged: UtmParams = { ...existing };
  for (const key of UTM_KEYS) {
    const incomingValue = incoming[key];
    if (incomingValue && !merged[key]) {
      merged[key] = incomingValue;
    }
  }

  if (safe) {
    const serialized = JSON.stringify(merged);
    try {
      safe.setItem(storageKey, serialized);
    } catch {
      // Storage lleno / quota: el caller recibe el merged en memoria
      // pero no se persiste. La atribución de la sesión actual sigue OK.
    }
  }

  return merged;
}

function readStoredUtm(storage: UtmStorageLike, key: string): UtmParams {
  try {
    const raw = storage.getItem(key);
    if (!raw) return {} as UtmParams;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return {} as UtmParams;
    }
    const out: UtmParams = {};
    for (const utmKey of UTM_KEYS) {
      const value = (parsed as Record<string, unknown>)[utmKey];
      out[utmKey] = normalizeUtmValue(value);
    }
    return out;
  } catch {
    return {} as UtmParams;
  }
}

/**
 * Lee UTMs con precedencia `sessionStorage > URL params` (per spec).
 * URL gana si llega directo al signup sin pasar por landing — útil cuando
 * el usuario guarda el link con UTMs embebidos.
 *
 * Si no hay nada, devuelve el fallback `direct/none/...` para mantener
 * trazabilidad (academia sin atribución explícita queda registrada como
 * direct/none en `academies.utm_*`).
 */
export function readUtmWithFallback(
  urlParams: URLSearchParams | Record<string, string | null | undefined>,
  storage: UtmStorageLike | undefined,
  storageKey: string = UTM_STORAGE_KEY
): Required<Record<UtmKey, string>> {
  const safe = safeStorage(storage);
  const fromStorage = safe ? readStoredUtm(safe, storageKey) : ({} as UtmParams);
  const fromUrl = pickUtmFromQuery(urlParams);

  const result: Record<UtmKey, string> = { ...UTM_DIRECT_FALLBACK };
  for (const key of UTM_KEYS) {
    const urlValue = fromUrl[key];
    if (urlValue) {
      result[key] = urlValue;
      continue;
    }
    const storageValue = fromStorage[key];
    if (storageValue) {
      result[key] = storageValue;
    }
  }
  return result as Required<Record<UtmKey, string>>;
}

/**
 * Compara dos sets de UTMs ignorando keys ausentes en ambos.
 * Útil en tests para verificar first-touch sin depender del orden.
 */
export function hasMatchingUtmKeys(
  a: UtmParams,
  b: Partial<Record<UtmKey, string | null | undefined>>
): boolean {
  for (const key of UTM_KEYS) {
    const aValue = a[key];
    const bValue = b[key];
    if (aValue && bValue && aValue !== bValue) return false;
  }
  return true;
}