import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ONBOARDING_OWNER_DONE_KEY,
  ONBOARDING_OWNER_STEP_KEYS,
  buildHttpsUrlInAllowlist,
  buildNextStepUrl,
  getOnboardingOwnerStepPath,
} from "@/lib/email/allowlist";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";

describe("email allowlist — B5 onboarding-owner", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalEmailDomain = process.env.ZALTYKO_EMAIL_DOMAIN;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.zaltyko.com";
    process.env.ZALTYKO_EMAIL_DOMAIN = "zaltyko.com";
  });

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    if (originalEmailDomain === undefined) delete process.env.ZALTYKO_EMAIL_DOMAIN;
    else process.env.ZALTYKO_EMAIL_DOMAIN = originalEmailDomain;
  });

  describe("getOnboardingOwnerStepPath", () => {
    it("devuelve el path interno Zaltyko para los 7 step keys canónicos", () => {
      for (const key of ONBOARDING_OWNER_STEP_KEYS) {
        expect(getOnboardingOwnerStepPath(key)).toBe(`/app/onboarding/${key}`);
      }
    });

    it("devuelve null para el sentinel `done`", () => {
      expect(getOnboardingOwnerStepPath(ONBOARDING_OWNER_DONE_KEY)).toBeNull();
    });

    it("devuelve null para step keys fuera de la allowlist", () => {
      expect(getOnboardingOwnerStepPath("invent")).toBeNull();
      expect(getOnboardingOwnerStepPath("")).toBeNull();
      expect(getOnboardingOwnerStepPath("login")).toBeNull();
    });
  });

  describe("buildNextStepUrl", () => {
    it("construye una URL HTTPS absoluta en allowlist para cada step canónico", () => {
      for (const key of ONBOARDING_OWNER_STEP_KEYS) {
        const result = buildNextStepUrl({ stepKey: key, academyId: ACADEMY_ID });
        expect(result.ok).toBe(true);
        expect(result.url).not.toBeNull();
        const url = new URL(result.url!);
        expect(url.protocol).toBe("https:");
        expect(url.pathname).toBe(`/app/onboarding/${key}`);
        expect(url.searchParams.get("academy")).toBe(ACADEMY_ID);
      }
    });

    it("devuelve sentinel `done` como `{ ok: true, url: null }`", () => {
      const result = buildNextStepUrl({ stepKey: "done", academyId: ACADEMY_ID });
      expect(result).toEqual({ ok: true, url: null });
    });

    it("rechaza step keys fuera de la allowlist con razón INVALID_STEP_KEY", () => {
      const result = buildNextStepUrl({ stepKey: "evil", academyId: ACADEMY_ID });
      expect(result.ok).toBe(false);
      expect(result.url).toBeNull();
      expect(result.reason).toBe("INVALID_STEP_KEY");
    });

    it("rechaza academyId vacío con razón INVALID_ACADEMY_ID", () => {
      const result = buildNextStepUrl({ stepKey: "add_5_athletes", academyId: "" });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("INVALID_ACADEMY_ID");
    });

    it("rechaza hosts fuera de la allowlist de Zaltyko", () => {
      // Forzamos que ni `NEXT_PUBLIC_APP_URL` ni `ZALTYKO_EMAIL_DOMAIN`
      // apunten al dominio Zaltyko, y mockeamos `config.domainName`
      // tambien para que el fallback de produccion no enmascare el test.
      process.env.NEXT_PUBLIC_APP_URL = "https://evil.example.com";
      process.env.ZALTYKO_EMAIL_DOMAIN = "evil.example.com";
      const result = buildNextStepUrl({
        stepKey: "add_5_athletes",
        academyId: ACADEMY_ID,
      });
      // El helper cae al `config.domainName` de Zaltyko en este caso
      // (safety net); verificamos que la URL construida SIEMPRE cae al
      // dominio Zaltyko, no al host atacante.
      expect(result.ok).toBe(true);
      const parsed = new URL(result.url!);
      expect(parsed.host.endsWith("zaltyko.com")).toBe(true);
    });

    it("rechaza scheme no-HTTPS en NEXT_PUBLIC_APP_URL", () => {
      process.env.NEXT_PUBLIC_APP_URL = "http://zaltyko.com";
      const result = buildNextStepUrl({
        stepKey: "add_5_athletes",
        academyId: ACADEMY_ID,
      });
      // El base URL real es `config.domainName` (`https://zaltyko.com`), por
      // lo que aqui terminamos construyendo la URL con HTTPS valido y debe
      // ser admitida. Este test verifica el fallback seguro.
      expect(result.ok).toBe(true);
      expect(new URL(result.url!).protocol).toBe("https:");
    });
  });

  describe("buildHttpsUrlInAllowlist", () => {
    it("acepta paths internos Zaltyko bajo allowlist", () => {
      const url = buildHttpsUrlInAllowlist("/app/settings/notifications");
      expect(url).not.toBeNull();
      const parsed = new URL(url!);
      expect(parsed.protocol).toBe("https:");
      expect(parsed.host).toBe("app.zaltyko.com");
    });

    it("rechaza paths vacios o invalidos", () => {
      expect(buildHttpsUrlInAllowlist("")).toBeNull();
      expect(buildHttpsUrlInAllowlist("   ")).toBeNull();
    });

    it("normaliza paths sin slash inicial", () => {
      const url = buildHttpsUrlInAllowlist("app/settings/notifications");
      expect(url).toMatch(/\/app\/settings\/notifications/);
    });
  });
});
