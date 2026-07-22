import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import type { NextRequest, NextResponse } from "next/server";

type CookieSource = NextRequest["cookies"] | ReadonlyRequestCookies;

const INVALID_REFRESH_TOKEN_CODES = new Set([
  "refresh_token_not_found",
  "invalid_refresh_token",
]);

export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: unknown; message?: unknown; name?: unknown };
  if (typeof maybeError.code === "string" && INVALID_REFRESH_TOKEN_CODES.has(maybeError.code)) {
    return true;
  }

  const message = typeof maybeError.message === "string" ? maybeError.message.toLowerCase() : "";
  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found")
  );
}

export function clearSupabaseAuthCookies(response: NextResponse, cookieSource: CookieSource) {
  for (const cookie of cookieSource.getAll()) {
    if (!cookie.name.startsWith("sb-")) continue;

    response.cookies.set(cookie.name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  }

  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
