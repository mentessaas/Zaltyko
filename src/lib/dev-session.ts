import { isDevFeaturesEnabled } from "@/lib/dev";

export const DEV_SESSION_COOKIE = "zaltyko_dev_session";

export type DevSessionPayload = {
  userId: string;
  profileId: string;
  tenantId: string;
  academyId: string;
  academyName?: string;
  academyType?: string | null;
  sessionId?: string;
  degraded?: boolean;
};

function encodeBase64(value: string) {
  if (typeof globalThis !== "undefined" && "btoa" in globalThis) {
    return (globalThis as typeof globalThis & { btoa: (input: string) => string }).btoa(value);
  }

  return Buffer.from(value, "utf8").toString("base64");
}

function decodeBase64(value: string) {
  if (typeof globalThis !== "undefined" && "atob" in globalThis) {
    return (globalThis as typeof globalThis & { atob: (input: string) => string }).atob(value);
  }

  return Buffer.from(value, "base64").toString("utf8");
}

export function serializeDevSession(payload: DevSessionPayload) {
  return encodeBase64(JSON.stringify(payload));
}

export function parseDevSessionCookie(rawValue?: string | null): DevSessionPayload | null {
  if (!isDevFeaturesEnabled || !rawValue) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64(rawValue)) as DevSessionPayload;
  } catch {
    return null;
  }
}

export function getDevSessionFromCookieStore(
  cookieStore: { get: (name: string) => { value: string } | undefined } | { get: (name: string) => Promise<{ value: string } | undefined> }
) {
  if (!isDevFeaturesEnabled) {
    return null;
  }

  const maybeCookie = cookieStore.get(DEV_SESSION_COOKIE);
  if (maybeCookie instanceof Promise) {
    return maybeCookie.then((cookie) => parseDevSessionCookie(cookie?.value));
  }

  return parseDevSessionCookie(maybeCookie?.value);
}
