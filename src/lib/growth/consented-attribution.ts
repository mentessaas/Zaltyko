import {
  hasAnalyticsConsent,
  type ConsentValue,
} from "@/lib/consent/state";
import { getSafePublicTrackingPath } from "@/lib/optional-tracking-policy";
import {
  pickUtmFromQuery,
  UTM_KEYS,
  UTM_STORAGE_KEY,
  type UtmKey,
  type UtmStorageLike,
} from "@/lib/growth/utm";

export interface ConsentedAttributionStorage extends UtmStorageLike {
  removeItem(key: string): void;
}

/** Separate consented storage from values written by the pre-gate capture. */
export const CONSENTED_UTM_STORAGE_KEY = "zaltyko_first_touch_utm_consented_v1";
const CONSENTED_UTM_PROVENANCE = "public_route_with_analytics_consent";

interface ConsentedUtmEnvelope {
  version: 1;
  provenance: typeof CONSENTED_UTM_PROVENANCE;
  utm: Partial<Record<UtmKey, string>>;
}

export function isUtmAttributionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION === "true";
}

export function getBrowserAttributionStorage():
  | ConsentedAttributionStorage
  | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function clearFirstTouchUtm(
  storage: Pick<ConsentedAttributionStorage, "removeItem"> | undefined
): void {
  for (const key of [UTM_STORAGE_KEY, CONSENTED_UTM_STORAGE_KEY]) {
    try {
      storage?.removeItem(key);
    } catch {
      // Storage can be blocked; attribution remains fail-closed on reads.
    }
  }
}

function clearLegacyFirstTouchUtm(
  storage: Pick<ConsentedAttributionStorage, "removeItem"> | undefined
): void {
  try {
    storage?.removeItem(UTM_STORAGE_KEY);
  } catch {
    // Never use legacy values as consented attribution.
  }
}

function parseConsentedEnvelope(raw: string | null): ConsentedUtmEnvelope | undefined {
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>).version !== 1 ||
    (parsed as Record<string, unknown>).provenance !== CONSENTED_UTM_PROVENANCE
  ) {
    return undefined;
  }

  const candidate = (parsed as Record<string, unknown>).utm;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return undefined;
  }
  const normalized = pickUtmFromQuery(
    candidate as Record<string, string | null | undefined>
  );
  const utm: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const value = normalized[key];
    if (typeof value === "string") utm[key] = value;
  }
  return Object.keys(utm).length > 0
    ? { version: 1, provenance: CONSENTED_UTM_PROVENANCE, utm }
    : undefined;
}

export function capturePublicFirstTouchUtm(input: {
  enabled: boolean;
  consentGranted: boolean;
  pathname: string;
  search: string;
  storage: UtmStorageLike | undefined;
}): boolean {
  if (
    !input.enabled ||
    !input.consentGranted ||
    !input.storage ||
    !getSafePublicTrackingPath(input.pathname)
  ) {
    return false;
  }

  const params = pickUtmFromQuery(new URLSearchParams(input.search));
  if (!UTM_KEYS.some((key) => typeof params[key] === "string")) return false;

  let merged: Partial<Record<UtmKey, string>>;
  try {
    merged = {
      ...(parseConsentedEnvelope(
        input.storage.getItem(CONSENTED_UTM_STORAGE_KEY)
      )?.utm ?? {}),
    };
  } catch {
    return false;
  }
  for (const key of UTM_KEYS) {
    const incoming = params[key];
    if (typeof incoming === "string" && !merged[key]) merged[key] = incoming;
  }

  const envelope: ConsentedUtmEnvelope = {
    version: 1,
    provenance: CONSENTED_UTM_PROVENANCE,
    utm: merged,
  };
  try {
    input.storage.setItem(
      CONSENTED_UTM_STORAGE_KEY,
      JSON.stringify(envelope)
    );
  } catch {
    // Storage can be blocked; do not fall back to a non-consented store.
    return false;
  }
  return true;
}

export function syncConsentedFirstTouchUtm(input: {
  enabled: boolean;
  consent: ConsentValue;
  pathname: string;
  search: string;
  storage: ConsentedAttributionStorage | undefined;
}): void {
  if (!input.enabled || input.consent !== "granted") {
    clearFirstTouchUtm(input.storage);
    return;
  }

  clearLegacyFirstTouchUtm(input.storage);
  capturePublicFirstTouchUtm({
    enabled: input.enabled,
    consentGranted: true,
    pathname: input.pathname,
    search: input.search,
    storage: input.storage,
  });
}

function readStoredUtm(
  storage: UtmStorageLike | undefined,
  storageKey: string
):
  | Partial<Record<UtmKey, string>>
  | undefined {
  if (!storage) return undefined;

  let raw: string | null;
  try {
    raw = storage.getItem(storageKey);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;

  if (storageKey === CONSENTED_UTM_STORAGE_KEY) {
    return parseConsentedEnvelope(raw)?.utm;
  }
  return undefined;
}

export function readConsentedFirstTouchUtm(input: {
  enabled: boolean;
  consentGranted: boolean;
  storage: UtmStorageLike | undefined;
}): Partial<Record<UtmKey, string>> | undefined {
  if (!input.enabled || !input.consentGranted) return undefined;
  return readStoredUtm(input.storage, CONSENTED_UTM_STORAGE_KEY);
}

/** Reads only the previously captured public first touch; never reads URL params. */
export function readOwnerOnboardingUtm():
  | Partial<Record<UtmKey, string>>
  | undefined {
  return readConsentedFirstTouchUtm({
    enabled: isUtmAttributionEnabled(),
    consentGranted: hasAnalyticsConsent(),
    storage: getBrowserAttributionStorage(),
  });
}
