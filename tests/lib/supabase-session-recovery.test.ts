import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";

import {
  clearSupabaseAuthCookies,
  isInvalidRefreshTokenError,
} from "@/lib/supabase/session-recovery";

describe("supabase session recovery", () => {
  it("detects invalid refresh token errors by code", () => {
    expect(isInvalidRefreshTokenError({ code: "refresh_token_not_found" })).toBe(true);
    expect(isInvalidRefreshTokenError({ code: "invalid_refresh_token" })).toBe(true);
  });

  it("detects invalid refresh token errors by message", () => {
    expect(
      isInvalidRefreshTokenError({
        message: "Invalid Refresh Token: Refresh Token Not Found",
      })
    ).toBe(true);
  });

  it("ignores unrelated auth errors", () => {
    expect(isInvalidRefreshTokenError({ code: "email_not_confirmed" })).toBe(false);
    expect(isInvalidRefreshTokenError(new Error("network timeout"))).toBe(false);
  });

  it("expires only Supabase auth cookies", () => {
    const response = NextResponse.json({ ok: true });
    const cookieSource = {
      getAll: () => [
        { name: "sb-project-auth-token", value: "stale-session" },
        { name: "zaltyko-locale", value: "es" },
      ],
    };

    clearSupabaseAuthCookies(response, cookieSource);

    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("");
    expect(response.cookies.get("zaltyko-locale")).toBeUndefined();
  });
});
