import { afterEach, describe, expect, it, vi } from "vitest";

import { PRODUCTION_SUPABASE_PROJECT_REF } from "@/lib/launch/production-supabase";
import {
  isConnectOnboardingFlagEnabled,
  isProductionDatabase,
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

  it("sk_test_ → test", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    expect(resolveConnectEnvironment()).toBe("test");
  });

  it("rk_live_ → live", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_x");
    expect(resolveConnectEnvironment()).toBe("live");
  });

  it("una clave publicable pk_live_ → null", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "pk_live_x");
    expect(resolveConnectEnvironment()).toBeNull();
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

describe("isProductionDatabase", () => {
  const databaseVariables = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "DATABASE_URL",
    "DATABASE_URL_POOL",
    "DATABASE_URL_DIRECT",
  ] as const;

  function clearDatabaseVariables() {
    for (const name of databaseVariables) vi.stubEnv(name, undefined);
  }

  it("la URL pública de Supabase de producción → true", () => {
    clearDatabaseVariables();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    expect(isProductionDatabase()).toBe(true);
  });

  it("la conexión del pooler de producción (usuario postgres.<ref>) → true", () => {
    clearDatabaseVariables();
    vi.stubEnv(
      "DATABASE_URL_POOL",
      `postgresql://postgres.${PRODUCTION_SUPABASE_PROJECT_REF}:placeholder@aws-0-eu-north-1.pooler.supabase.com:6543/postgres`
    );
    expect(isProductionDatabase()).toBe(true);
  });

  it("staging u otra Supabase → false", () => {
    clearDatabaseVariables();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://stagingsynthetic01.supabase.co");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:placeholder@db.stagingsynthetic01.supabase.co:5432/postgres");
    expect(isProductionDatabase()).toBe(false);
  });

  it("sin variables o con valores que no son URL → false", () => {
    clearDatabaseVariables();
    expect(isProductionDatabase()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "no-es-una-url");
    expect(isProductionDatabase()).toBe(false);
  });
});
