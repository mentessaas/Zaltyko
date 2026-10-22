/**
 * Local-only auth seam for the signup E2E.
 *
 * It is intentionally cookie-based and only enabled in development with the
 * explicit E2E flag. It must never be used as an authentication mechanism in a
 * deployed environment.
 */
export const E2E_MOCK_AUTH_COOKIE = "zaltyko_e2e_mock_auth";
export const E2E_MOCK_AUTH_CLIENT_COOKIE = "zaltyko_e2e_mock_client";

export interface E2EMockUserPayload {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}

export function isE2EMockAuthEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.E2E_MOCK_AUTH === "1";
}

/**
 * The browser cannot read the server-only E2E_MOCK_AUTH flag. The Playwright
 * harness opts into the browser seam with a local cookie instead.
 * NODE_ENV remains a guard so this cannot activate in a deployed environment.
 */
export function isE2EMockAuthClientEnabled(cookieHeader?: string): boolean {
  if (process.env.NODE_ENV !== "development" || !cookieHeader) return false;
  return cookieHeader.split(";").some((part) => {
    const [name, value] = part.trim().split("=", 2);
    return name === E2E_MOCK_AUTH_CLIENT_COOKIE && value === "1";
  });
}

export function parseE2EMockUser(rawValue?: string | null): E2EMockUserPayload | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.id !== "string" || typeof value.email !== "string") return null;
    return {
      id: value.id,
      email: value.email,
      user_metadata:
        value.user_metadata && typeof value.user_metadata === "object"
          ? (value.user_metadata as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}
