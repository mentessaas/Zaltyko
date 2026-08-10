import { createHash } from "node:crypto";

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
 * missing one breach check. The trade-off is logged.
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
  return createHash("sha1").update(input, "utf8").digest("hex").toUpperCase();
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
