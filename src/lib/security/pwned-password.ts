/**
 * HaveIBeenPwned (HIBP) k-anonymity password check.
 *
 * Reproduces the protection that Supabase Pro offers natively
 * ("Leaked Password Protection") without requiring an upgraded plan.
 *
 * How it works:
 *   1. Compute SHA-1 of the candidate password (uppercase hex).
 *   2. Send only the first 5 chars of the hash to the public HIBP range
 *      endpoint. The full hash and the plaintext password never leave the
 *      process.
 *   3. The endpoint returns ~500 lines of "SUFFIX:COUNT" pairs. If our
 *      suffix (chars 6..40) appears with COUNT > 0, the password has been
 *      seen in a public breach corpus and must be rejected.
 *
 * Fail-open policy: if the HIBP endpoint is unreachable / times out / returns
 * a 5xx, we treat the password as "unknown" and let the registration /
 * password-change flow proceed. The risk of locking out a legitimate user
 * because a third-party API hiccupped is worse than the marginal exposure of
 * missing one breach check. Callers can inspect `unavailable` and log or
 * monitor the trade-off without exposing secrets.
 *
 * Why this is safe:
 *   - Only the 5-char hash prefix is sent, never the plaintext.
 *   - SHA-1 collisions don't help an attacker because the response includes
 *     the full breach suffix matched against our exact 35-char suffix.
 *   - HIBP does not log requests tied to identities, only the prefix.
 */

const HIBP_RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range/";
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_USER_AGENT = "Zaltyko-Security-Check";

export type PwnedPasswordResult = {
  /** True when the password appears in HIBP with count > 0. */
  pwned: boolean;
  /** Number of breach occurrences reported by HIBP. 0 when not pwned. */
  count: number;
  /** True if the check could not be performed (network, timeout, 5xx). */
  unavailable: boolean;
};

/**
 * Internal sentinel thrown inside the try-block so we can distinguish a
 * deliberate HTTP-status throw (from `failOpenOnHttpError=false`) from a
 * network/abort error (which must still fail-open). Caught and re-classified
 * by `checkPwnedPassword`.
 */
class HttpStatusError extends Error {
  status: number;
  constructor(status: number) {
    super(`HIBP responded with HTTP ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

export type PwnedPasswordOptions = {
  /** Override fetch (used in tests, and for environments without global fetch). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 3000. */
  timeoutMs?: number;
  /**
   * When true, treat any non-OK HTTP response as "unavailable" and fail-open.
   * Defaults to true.
   */
  failOpenOnHttpError?: boolean;
};

/**
 * Compute SHA-1 of the input, uppercase hex (40 chars).
 * Exported for testing.
 */
export function sha1Hex(input: string): string {
  // Keep this implementation dependency-free and browser-compatible: this
  // helper is imported by the client-side signup forms as well as server code.
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const words = new Uint32Array(80);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) {
      words[i] = ((words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16]) << 1) |
        ((words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16]) >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const rotatedA = (a << 5) | (a >>> 27);
      const next = (rotatedA + f + e + k + words[i]) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = next;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Parse the HIBP range response. The endpoint returns text/plain with one
 * `SUFFIX:COUNT` per line. We accept CRLF or LF, ignore blank lines, and
 * tolerate a leading "ADD-Padding-A-B-C..." header which is sometimes
 * inserted by the upstream service for traffic-shaping (per HIBP docs).
 */
export function findPwnedCount(rangeResponse: string, fullHashUpper: string): number {
  const suffix = fullHashUpper.slice(5);
  const lines = rangeResponse.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sepIndex = trimmed.indexOf(":");
    if (sepIndex <= 0) continue;
    const candidateSuffix = trimmed.slice(0, sepIndex).toUpperCase();
    if (candidateSuffix === suffix) {
      const countStr = trimmed.slice(sepIndex + 1).trim();
      const count = Number.parseInt(countStr, 10);
      if (Number.isFinite(count) && count > 0) {
        return count;
      }
      return 0;
    }
  }
  return 0;
}

/**
 * Check whether the given password appears in the HaveIBeenPwned corpus
 * using the k-anonymity range API. Only the first 5 chars of the SHA-1
 * hash are ever sent.
 *
 * @param password  Plaintext password to check. Never leaves the process
 *                  except as a 5-char hash prefix.
 * @param options   Optional fetch override, timeout, fail-open toggle.
 */
export async function checkPwnedPassword(
  password: string,
  options: PwnedPasswordOptions = {}
): Promise<PwnedPasswordResult> {
  if (typeof password !== "string" || password.length === 0) {
    // Empty passwords are a separate validation concern; HIBP would happily
    // tell us about "" but it's faster and clearer to short-circuit here.
    return { pwned: false, count: 0, unavailable: false };
  }

  const fullHash = sha1Hex(password);
  const prefix = fullHash.slice(0, 5);
  const url = `${HIBP_RANGE_ENDPOINT}${prefix}`;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { pwned: false, count: 0, unavailable: true };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const failOpenOnHttpError = options.failOpenOnHttpError ?? true;

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutHandle = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        // HIBP requires a non-default User-Agent.
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "text/plain",
        "Add-Padding": "true", // HIBP recommends this for response uniformity.
      },
      signal: controller?.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      if (failOpenOnHttpError) {
        return { pwned: false, count: 0, unavailable: true };
      }
      throw new HttpStatusError(response.status);
    }

    const body = await response.text();
    const count = findPwnedCount(body, fullHash);
    return { pwned: count > 0, count, unavailable: false };
  } catch (error) {
    // An HttpStatusError is intentional (the caller asked for fail-closed).
    // Let it propagate; do not classify it as "unavailable".
    if (error instanceof HttpStatusError) {
      throw error;
    }
    // Network error, abort (timeout), or JSON/text parse error. Per the
    // fail-open policy, treat as unavailable rather than locking users out.
    return { pwned: false, count: 0, unavailable: true };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/**
 * User-facing error message when a password is found in the breach corpus.
 * Localized to Spanish to match the rest of the Zaltyko UI.
 */
export const PWNED_PASSWORD_MESSAGE =
  "Esta contraseña aparece en filtraciones públicas conocidas. Elige otra contraseña para mantener tu cuenta segura.";
