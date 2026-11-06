import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const fixture: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  DATABASE_CA_CERT_PATH: "certs/supabase-root-ca.crt",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "codex/mvp-main-bridge-20261025",
  ZALTYKO_DELIVERY_PREVIEW: "true",
  SAAS_QA_SHORT_PAID_ENABLED: "false",
  NEXT_PUBLIC_SUPABASE_URL: "https://aeeootdmuiqkfeernskw.supabase.co",
  STRIPE_SECRET_KEY: "sk_test_synthetic",
  STRIPE_SAAS_ENVIRONMENT: "test",
  STRIPE_SAAS_TEST_SECRET_KEY: "sk_test_synthetic",
  STRIPE_SAAS_TEST_ACCOUNT_REFERENCE: "acct_1UVtpNDdRiQuy2QT",
  STRIPE_SAAS_TEST_WEBHOOK_SECRET: "whsec_synthetic",
  STRIPE_SAAS_TEST_PORTAL_ENABLED: "true",
  KV_REST_API_URL: "https://wondrous-hog-178401.upstash.io",
  KV_REST_API_TOKEN: "synthetic",
};
for (const key of ["DATABASE_URL", "DATABASE_URL_POOL", "DATABASE_URL_DIRECT"]) {
  fixture[key] = "postgresql://zaltyko_delivery_server_v1.aeeootdmuiqkfeernskw:synthetic@aws-0-eu-north-1.pooler.supabase.com/postgres";
}
for (const interval of ["STARTER_MONTH", "STARTER_YEAR", "GROWTH_MONTH", "GROWTH_YEAR"]) {
  fixture[`STRIPE_SAAS_TEST_PRICE_${interval}`] = "price_synthetic";
}

describe("delivery preview isolation preflight", () => {
  function contactPermit(): NodeJS.ProcessEnv {
    return { ...fixture, VERCEL: "1", NODE_ENV: "production", VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
      ZALTYKO_DELIVERY_CONTACT_EMAIL_ENABLED: "true", DELIVERY_CONTACT_EMAIL_API_KEY: "synthetic-exclusive-key",
      DELIVERY_CONTACT_EMAIL_QA_EMAIL: "qa@example.invalid", DELIVERY_CONTACT_EMAIL_QA_AUTH_USER_ID: "10000000-0000-4000-8000-000000000001",
      DELIVERY_CONTACT_EMAIL_RUN_ID: "synthetic-run-7f3b0001", DELIVERY_CONTACT_EMAIL_REQUEST_SHA256: "b".repeat(64),
      DELIVERY_CONTACT_EMAIL_APPROVED_COMMIT_SHA: "a".repeat(40),
      DELIVERY_CONTACT_EMAIL_EXPIRES_AT: new Date(Date.now() + 900_000).toISOString() };
  }
  it("admits only the complete synthetic contact permit while shared Brevo stays forbidden", () => {
    const permit = contactPermit();
    const result = spawnSync(process.execPath, ["preview-build-preflight.cjs"], { env: permit, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"deliveryContactEmailIsolation":true');
    expect(result.stdout).toContain('"noExternalProviders":true');
    expect(result.stdout).not.toContain("synthetic-exclusive-key");
    expect(result.stdout).not.toContain("qa@example.invalid");
    // CI=1 is a Vercel build system variable, not permission for GitHub CI.
    expect(spawnSync(process.execPath, ["preview-build-preflight.cjs"], { env: { ...permit, CI: "1" } }).status).toBe(0);
    expect(spawnSync(process.execPath, ["preview-build-preflight.cjs"], { env: { ...permit, CI: "1", GITHUB_ACTIONS: "true" } }).status).toBe(1);
    expect(spawnSync(process.execPath, ["preview-build-preflight.cjs"], { env: { ...permit, BREVO_API_KEY: "synthetic-global-key" } }).status).toBe(1);
  });
  it.each([
    { ZALTYKO_DELIVERY_CONTACT_EMAIL_ENABLED: "false" }, { ZALTYKO_DELIVERY_CONTACT_EMAIL_ENABLED: "" },
    { ZALTYKO_DELIVERY_PREVIEW: "false" }, { VERCEL_ENV: "production" }, { VERCEL: "" },
    { NODE_ENV: "test" }, { GITHUB_ACTIONS: "true" },
    { VERCEL_GIT_COMMIT_REF: "main" }, { VERCEL_GIT_COMMIT_SHA: "c".repeat(40) },
    { DELIVERY_CONTACT_EMAIL_API_KEY: "" }, { DELIVERY_CONTACT_EMAIL_QA_EMAIL: "QA@example.invalid" },
    { DELIVERY_CONTACT_EMAIL_QA_AUTH_USER_ID: "bad" }, { DELIVERY_CONTACT_EMAIL_RUN_ID: "bad" },
    { DELIVERY_CONTACT_EMAIL_REQUEST_SHA256: "bad" }, { DELIVERY_CONTACT_EMAIL_APPROVED_COMMIT_SHA: "c".repeat(40) },
    { DELIVERY_CONTACT_EMAIL_EXPIRES_AT: "2000-01-01T00:00:00Z" },
    { DELIVERY_CONTACT_EMAIL_EXPIRES_AT: "2999-01-01T00:00:00Z" },
    { DELIVERY_CONTACT_EMAIL_EXPIRES_AT: "2026-11-06T12:00:00+00:00" },
    { ZALTYKO_TEAM_ACCESS_ENABLED: "true" },
  ])("rejects an unsafe/partial contact permit %o", (override) => {
    const result = spawnSync(process.execPath, ["preview-build-preflight.cjs"], { env: { ...contactPermit(), ...override }, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("synthetic-exclusive-key");
    expect(result.stdout).not.toContain("qa@example.invalid");
  });
  it.each(["API_KEY", "QA_EMAIL", "QA_AUTH_USER_ID", "RUN_ID", "REQUEST_SHA256", "APPROVED_COMMIT_SHA", "EXPIRES_AT"])("rejects partial namespace %s with OFF", (key) => {
    expect(spawnSync(process.execPath, ["preview-build-preflight.cjs"], {
      env: { ...fixture, [`DELIVERY_CONTACT_EMAIL_${key}`]: "synthetic" }, encoding: "utf8",
    }).status).toBe(1);
  });
  it("accepts only the delivery sandbox with experiment flags off", () => {
    expect(execFileSync(process.execPath, ["preview-build-preflight.cjs"], {
      env: fixture, encoding: "utf8",
    })).toContain('"deliveryIsolation":true');
  });
  it.each(["DATABASE_URL", "DATABASE_URL_POOL", "DATABASE_URL_DIRECT"])(
    "rejects the experiment credential in delivery for %s",
    (key) => {
      const result = spawnSync(process.execPath, ["preview-build-preflight.cjs"], {
        env: { ...fixture, [key]: fixture[key]!.replace("zaltyko_delivery_server_v1", "zaltyko_preview_server_v2") },
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain(":synthetic@");
    },
  );
  it("preserves the experiment credential requirement outside delivery", () => {
    const experiment: NodeJS.ProcessEnv = {
      ...fixture,
      ZALTYKO_DELIVERY_PREVIEW: "false",
      STRIPE_SAAS_TEST_ACCOUNT_REFERENCE: "acct_1STR6eDXXopppUpe",
      SAAS_QA_SHORT_PAID_ENABLED: "true",
      SAAS_QA_SHORT_PAID_RUN: "short-paid-expiry-20261021-v3",
      SAAS_QA_SHORT_PAID_EXPIRES_AT: "2026-10-22T18:30:00Z",
    };
    for (const key of ["DATABASE_URL", "DATABASE_URL_POOL", "DATABASE_URL_DIRECT"]) {
      experiment[key] = fixture[key]!.replace("zaltyko_delivery_server_v1", "zaltyko_preview_server_v2");
    }
    expect(execFileSync(process.execPath, ["preview-build-preflight.cjs"], {
      env: experiment, encoding: "utf8",
    })).toContain('"shortPaidQa":true');
    expect(spawnSync(process.execPath, ["preview-build-preflight.cjs"], {
      env: { ...experiment, DATABASE_URL: fixture.DATABASE_URL }, encoding: "utf8",
    }).status).toBe(1);
    expect(spawnSync(process.execPath, ["preview-build-preflight.cjs"], {
      env: { ...experiment, STRIPE_SAAS_TEST_ACCOUNT_REFERENCE: fixture.STRIPE_SAAS_TEST_ACCOUNT_REFERENCE }, encoding: "utf8",
    }).status).toBe(1);
  });
  it.each([
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { SAAS_QA_SHORT_PAID_ENABLED: "true" },
    { SAAS_QA_SHORT_PAID_RUN: "short-paid-expiry-20261021-v3" },
    { SAAS_QA_SHORT_PAID_EXPIRES_AT: "2026-10-22T18:30:00Z" },
    { STRIPE_SAAS_ENVIRONMENT: "live" },
    { STRIPE_SAAS_TEST_ACCOUNT_REFERENCE: "acct_1STR6eDXXopppUpe" },
    { STRIPE_SAAS_TEST_ACCOUNT_REFERENCE: "acct_unknown" },
    { STRIPE_SAAS_TEST_ACCOUNT_REFERENCE: "" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { CRON_SECRET: "synthetic" },
  ])("rejects unsafe override %o without printing values", (override) => {
    const result = spawnSync(process.execPath, ["preview-build-preflight.cjs"], {
      env: { ...fixture, ...override }, encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("sk_test_synthetic");
    expect(result.stdout).not.toContain(":synthetic@");
  });
});
