<<<<<<< HEAD
import { createHmac, timingSafeEqual } from "crypto";

=======
>>>>>>> origin/main
import { isDevSessionEnabled } from "@/lib/dev";

export const DEV_SESSION_COOKIE = "zaltyko_dev_session";

<<<<<<< HEAD
function getDevSessionSecret(): string | null {
  return process.env.INTERNAL_AUTH_SECRET || process.env.DEV_SESSION_SECRET || null;
}

function signPayload(b64: string, secret: string): string {
  return createHmac("sha256", secret).update(b64).digest("hex");
}

=======
>>>>>>> origin/main
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
<<<<<<< HEAD
  const b64 = encodeBase64(JSON.stringify(payload));
  const secret = getDevSessionSecret();
  if (!secret) return b64;
  return `${b64}.${signPayload(b64, secret)}`;
=======
  return encodeBase64(JSON.stringify(payload));
>>>>>>> origin/main
}

export function parseDevSessionCookie(rawValue?: string | null): DevSessionPayload | null {
  if (!isDevSessionEnabled || !rawValue) {
    return null;
  }

  try {
<<<<<<< HEAD
    const secret = getDevSessionSecret();
    let b64 = rawValue;
    if (secret && rawValue.includes(".")) {
      const [payload, sig] = rawValue.split(".", 2);
      if (!payload || !sig) return null;
      const expected = signPayload(payload, secret);
      if (payload.length !== expected.length && sig.length !== expected.length) return null;
      // timingSafeEqual requires same length buffers
      const a = Buffer.from(sig, "hex");
      const b = Buffer.from(expected, "hex");
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      b64 = payload;
    } else if (secret && !rawValue.includes(".")) {
      // Secret configurado pero cookie sin firma (versión antigua) -> rechazar
      return null;
    }
    return JSON.parse(decodeBase64(b64)) as DevSessionPayload;
=======
    return JSON.parse(decodeBase64(rawValue)) as DevSessionPayload;
>>>>>>> origin/main
  } catch {
    return null;
  }
}

export function getDevSessionFromCookieStore(
  cookieStore: { get: (name: string) => { value: string } | undefined } | { get: (name: string) => Promise<{ value: string } | undefined> }
) {
  if (!isDevSessionEnabled) {
    return null;
  }

  const maybeCookie = cookieStore.get(DEV_SESSION_COOKIE);
  if (maybeCookie instanceof Promise) {
    return maybeCookie.then((cookie) => parseDevSessionCookie(cookie?.value));
  }

  return parseDevSessionCookie(maybeCookie?.value);
}
