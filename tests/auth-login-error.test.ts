import { describe, expect, it } from "vitest";
import { isLoginNoticeCode } from "@/lib/auth/login-error";

describe("isLoginNoticeCode", () => {
  it.each([
    "access_disabled",
    "callback_failed",
    "consent_invalid",
    "consent_record_failed",
  ])("reconoce el aviso %s", (code) => {
    expect(isLoginNoticeCode(code)).toBe(true);
  });

  it("no trata errores arbitrarios del query como avisos de acceso", () => {
    expect(isLoginNoticeCode("unexpected")).toBe(false);
    expect(isLoginNoticeCode(undefined)).toBe(false);
  });
});
