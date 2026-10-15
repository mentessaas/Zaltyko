const STORAGE_KEY = "zaltyko.cookie-consent.v1";
export const COOKIE_CONSENT_CHANGE_EVENT = "zaltyko:cookie-consent-change";
export const COOKIE_CONSENT_OPEN_EVENT = "zaltyko:cookie-consent-open";

export type CookieConsent = {
  version: 1;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  savedAt: string;
};

let cachedRaw: string | null | undefined;
let cachedConsent: CookieConsent | null = null;
let memoryConsent: CookieConsent | null = null;

function parseConsent(raw: string | null): CookieConsent | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<CookieConsent>;
    if (
      value.version !== 1 ||
      value.necessary !== true ||
      typeof value.analytics !== "boolean" ||
      typeof value.marketing !== "boolean" ||
      typeof value.savedAt !== "string"
    ) {
      return null;
    }

    return {
      version: 1,
      necessary: true,
      analytics: value.analytics,
      marketing: value.marketing,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

export function readCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedConsent;
    cachedRaw = raw;
    cachedConsent = parseConsent(raw);
    memoryConsent = cachedConsent;
    return cachedConsent;
  } catch {
    return memoryConsent;
  }
}

export function saveCookieConsent(
  preferences: Pick<CookieConsent, "analytics" | "marketing">
): CookieConsent {
  const consent: CookieConsent = {
    version: 1,
    necessary: true,
    analytics: preferences.analytics,
    marketing: preferences.marketing,
    savedAt: new Date().toISOString(),
  };
  const raw = JSON.stringify(consent);

  memoryConsent = consent;
  cachedRaw = raw;
  cachedConsent = consent;

  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // Keep this choice for the current page session if browser storage is blocked.
  }

  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGE_EVENT));
  return consent;
}
