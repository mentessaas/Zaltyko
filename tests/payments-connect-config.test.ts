import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isConnectOnboardingFlagEnabled,
  resolveConnectEnvironment,
} from "@/modules/payments-connect/application/config";

/**
 * Conectar Stripe (cobro automático, Fase 1): bandera y entorno leídos del
 * entorno del proceso. Claves sintéticas; nunca una clave real.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveConnectEnvironment", () => {
  it("sk_live_ → live", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    expect(resolveConnectEnvironment()).toBe("live");
  });

  it("rk_test_ → test", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_x");
    expect(resolveConnectEnvironment()).toBe("test");
  });

  it("sin clave → null", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", undefined);
    expect(resolveConnectEnvironment()).toBeNull();
  });
});

describe("isConnectOnboardingFlagEnabled", () => {
  it("solo el texto exacto true la enciende", () => {
    vi.stubEnv("ZALTYKO_CONNECT_ONBOARDING_ENABLED", "true");
    expect(isConnectOnboardingFlagEnabled()).toBe(true);
    vi.stubEnv("ZALTYKO_CONNECT_ONBOARDING_ENABLED", "1");
    expect(isConnectOnboardingFlagEnabled()).toBe(false);
    vi.stubEnv("ZALTYKO_CONNECT_ONBOARDING_ENABLED", undefined);
    expect(isConnectOnboardingFlagEnabled()).toBe(false);
  });
});
