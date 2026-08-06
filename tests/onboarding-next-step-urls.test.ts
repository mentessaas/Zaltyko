import { describe, expect, it } from "vitest";

import {
  NEXT_STEP_URLS,
  isNextStepKey,
  listValidNextStepKeys,
  resolveNextStepUrl,
} from "@/lib/onboarding/next-step-urls";
import { buildSignedEmailLinkUrl } from "@/lib/onboarding/email-link-token";
import { CHECKLIST_KEYS, WIZARD_STEP_KEYS } from "@/lib/onboarding-utils";

describe("onboarding/next-step-urls (ZAL-324 Gap 2)", () => {
  const appUrl = "https://zaltyko.com";

  it("cubre todos los checklist_keys y wizard_step_keys del modulo de utilidades", () => {
    const all = listValidNextStepKeys();
    for (const k of CHECKLIST_KEYS) {
      expect(all).toContain(k);
    }
    for (const k of WIZARD_STEP_KEYS) {
      expect(all).toContain(k);
    }
  });

  it("todas las URLs son paths internos (sin protocolo externo)", () => {
    for (const [key, url] of Object.entries(NEXT_STEP_URLS)) {
      expect(url, `key=${key}`).toMatch(/^\//);
      expect(url, `key=${key}`).not.toMatch(/^https?:/);
    }
  });

  it("resolveNextStepUrl devuelve URL absoluta limpia sin params", () => {
    const url = resolveNextStepUrl("enable_payments", appUrl);
    expect(url).toBe("https://zaltyko.com/app/settings/billing");
  });

  it("resolveNextStepUrl agrega queryParams codificados", () => {
    const url = resolveNextStepUrl("login_again", appUrl, {
      redirect: "/app/athletes",
      utm_source: "d7",
    });
    expect(url).toContain("/auth/sign-in?");
    expect(url).toContain("redirect=%2Fapp%2Fathletes");
    expect(url).toContain("utm_source=d7");
  });

  it("resolveNextStepUrl rechaza claves fuera del allowlist", () => {
    expect(() => resolveNextStepUrl("totally_invalid_key", appUrl)).toThrowError(
      /no esta en el allowlist/
    );
    expect(() => resolveNextStepUrl("", appUrl)).toThrowError();
    expect(() => resolveNextStepUrl("../../../etc/passwd", appUrl)).toThrowError();
  });

  it("isNextStepKey hace type-narrowing correcto", () => {
    expect(isNextStepKey("enable_payments")).toBe(true);
    expect(isNextStepKey("totally_invalid_key")).toBe(false);
  });

  it("buildSignedEmailLinkUrl (integrado con email-link-token) genera URL firmada", () => {
    process.env.UNSUBSCRIBE_HMAC_SECRET =
      process.env.UNSUBSCRIBE_HMAC_SECRET ?? "test-secret-for-vitest-must-be-long";
    const { url, expiresAt } = buildSignedEmailLinkUrl({
      email: "owner@academia.test",
      purpose: "unsubscribe",
      appUrl,
      path: "/unsubscribe",
      nowMs: 1_700_000_000_000,
    });
    expect(url).toMatch(/^https:\/\/zaltyko\.com\/unsubscribe\?token=/);
    const token = url.split("token=")[1] ?? "";
    expect(token.length).toBeGreaterThan(20);
    expect(expiresAt).toBeGreaterThan(Math.floor(1_700_000_000_000 / 1000));
  });
});
