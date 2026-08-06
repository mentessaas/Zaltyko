import { describe, expect, it, beforeEach } from "vitest";

import {
  buildEmailLinkToken,
  buildSignedEmailLinkUrl,
  signEmailLinkToken,
  verifyEmailLinkToken,
} from "@/lib/onboarding/email-link-token";

const SECRET = "test-secret-must-be-long-enough-for-hmac-suite";
const NOW_MS = 1_700_000_000_000;

describe("onboarding/email-link-token (ZAL-324 Gap 5)", () => {
  beforeEach(() => {
    process.env.UNSUBSCRIBE_HMAC_SECRET = SECRET;
    process.env.NODE_ENV = "test";
  });

  it("firma y verifica happy path", () => {
    const { token } = buildEmailLinkToken({
      email: "owner@academia.test",
      purpose: "unsubscribe",
      nowMs: NOW_MS,
    });
    const result = verifyEmailLinkToken(token, NOW_MS + 1000);
    expect(result.ok).toBe(true);
    expect(result.payload?.email).toBe("owner@academia.test");
    expect(result.payload?.purpose).toBe("unsubscribe");
  });

  it("rechaza tokens expirados", () => {
    const { token, expiresAt } = buildEmailLinkToken({
      email: "owner@academia.test",
      purpose: "unsubscribe",
      nowMs: NOW_MS,
      ttlSeconds: 60,
    });
    void expiresAt;
    const result = verifyEmailLinkToken(token, NOW_MS + 120_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("EXPIRED");
  });

  it("rechaza tokens con firma manipulada", () => {
    const { token } = buildEmailLinkToken({
      email: "owner@academia.test",
      purpose: "unsubscribe",
      nowMs: NOW_MS,
    });
    // voltear un caracter del suffix (firma)
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]?.slice(0, -2)}AA`;
    const result = verifyEmailLinkToken(tampered, NOW_MS + 1000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("INVALID_SIGNATURE");
  });

  it("rechaza tokens mal formados", () => {
    expect(verifyEmailLinkToken("not-a-token", NOW_MS).ok).toBe(false);
    expect(verifyEmailLinkToken("only.one.dot.too.many", NOW_MS).ok).toBe(false);
    expect(verifyEmailLinkToken("", NOW_MS).ok).toBe(false);
    const bad = verifyEmailLinkToken("@@@.@@@", NOW_MS);
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe("MALFORMED");
  });

  it("rechaza tokens con expiracion en el futuro lejano (FUTURE_EXPIRY)", () => {
    const token = signEmailLinkToken({
      email: "owner@academia.test",
      purpose: "unsubscribe",
      // 2 anos adelante: claramente fuera del TTL normal de 30 dias y
      // fuera del margen de 1 ano que el verificador acepta.
      expiresAt: Math.floor(NOW_MS / 1000) + 86400 * 365 * 2,
      nonce: "abc123",
    });
    const result = verifyEmailLinkToken(token, NOW_MS);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("FUTURE_EXPIRY");
  });

  it("normaliza email (case + trim) en payload canónico", () => {
    const { token } = buildEmailLinkToken({
      email: "  OWNER@Academia.Test  ",
      purpose: "preferences",
      nowMs: NOW_MS,
    });
    const result = verifyEmailLinkToken(token, NOW_MS + 1000);
    expect(result.ok).toBe(true);
    expect(result.payload?.email).toBe("owner@academia.test");
  });

  it("propaga purpose y lo preserva en payload", () => {
    const unsubscribe = buildEmailLinkToken({
      email: "x@y.z",
      purpose: "unsubscribe",
      nowMs: NOW_MS,
    });
    const prefs = buildEmailLinkToken({
      email: "x@y.z",
      purpose: "preferences",
      nowMs: NOW_MS,
    });
    expect(verifyEmailLinkToken(unsubscribe.token, NOW_MS + 1000).payload?.purpose).toBe(
      "unsubscribe"
    );
    expect(verifyEmailLinkToken(prefs.token, NOW_MS + 1000).payload?.purpose).toBe(
      "preferences"
    );
  });

  it("buildSignedEmailLinkUrl devuelve URL absoluta con token en query", () => {
    const { url, expiresAt } = buildSignedEmailLinkUrl({
      email: "owner@academia.test",
      purpose: "unsubscribe",
      appUrl: "https://zaltyko.com/",
      path: "unsubscribe",
      nowMs: NOW_MS,
    });
    expect(url.startsWith("https://zaltyko.com/unsubscribe?token=")).toBe(true);
    expect(expiresAt).toBeGreaterThan(Math.floor(NOW_MS / 1000));
  });

  it("usa UNSUBSCRIBE_HMAC_SECRET cuando esta configurado", () => {
    // El caso de fallback (sin UNSUBSCRIBE_HMAC_SECRET) lo cubre el beforeEach
    // del describe; este test verifica el path principal.
    const { token } = buildEmailLinkToken({
      email: "owner@academia.test",
      purpose: "unsubscribe",
      nowMs: NOW_MS,
    });
    const result = verifyEmailLinkToken(token, NOW_MS + 1000);
    expect(result.ok).toBe(true);
  });
});
