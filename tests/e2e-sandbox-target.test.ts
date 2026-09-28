import { describe, expect, it } from "vitest";

import {
  assertDisposableE2EEmail,
  assertE2ESandboxTarget,
  assertLocalPlaywrightTarget,
} from "../scripts/lib/e2e-sandbox-target";

const sandboxRef = "aeeootdmuiqkfeernskw";
const common = {
  expectedProjectRef: sandboxRef,
  allowProvisioning: "true",
};

describe("E2E provisioning target guard", () => {
  it("accepts only disposable test-domain emails for provisioning", () => {
    expect(() =>
      assertDisposableE2EEmail("e2e-parent@zaltyko.test", "family")
    ).not.toThrow();
    expect(() =>
      assertDisposableE2EEmail("real.person@zaltyko.com", "family")
    ).toThrow(/disposable/);
    expect(() => assertDisposableE2EEmail(undefined, "athlete")).toThrow(
      /disposable/
    );
  });

  it("accepts a matching isolated Supabase project and database", () => {
    expect(
      assertE2ESandboxTarget({
        ...common,
        supabaseUrl: `https://${sandboxRef}.supabase.co`,
        databaseUrl: `postgresql://db.${sandboxRef}.supabase.co:5432/postgres`,
      })
    ).toBe(sandboxRef);
  });

  it("rejects the known production project even when explicitly selected", () => {
    expect(() =>
      assertE2ESandboxTarget({
        ...common,
        expectedProjectRef: "jegxfahsvugilbthbked",
        supabaseUrl: "https://jegxfahsvugilbthbked.supabase.co",
        databaseUrl: "postgresql://db.jegxfahsvugilbthbked.supabase.co:5432/postgres",
      })
    ).toThrow(/production Supabase project/);
  });

  it("requires an explicit target and refuses mismatched database or API projects", () => {
    expect(() =>
      assertE2ESandboxTarget({
        ...common,
        expectedProjectRef: undefined,
        supabaseUrl: `https://${sandboxRef}.supabase.co`,
        databaseUrl: `postgresql://db.${sandboxRef}.supabase.co:5432/postgres`,
      })
    ).toThrow(/must explicitly identify/);

    expect(() =>
      assertE2ESandboxTarget({
        ...common,
        supabaseUrl: "https://jegxfahsvugilbthbked.supabase.co",
        databaseUrl: `postgresql://db.${sandboxRef}.supabase.co:5432/postgres`,
      })
    ).toThrow(/does not match/);

    expect(() =>
      assertE2ESandboxTarget({
        ...common,
        supabaseUrl: `https://${sandboxRef}.supabase.co`,
        databaseUrl:
          "postgresql://db.jegxfahsvugilbthbked.supabase.co:5432/postgres",
      })
    ).toThrow(/DATABASE_URL does not match/);
  });

  it("supports pooler connections only when the username identifies the sandbox", () => {
    expect(
      assertE2ESandboxTarget({
        ...common,
        databaseUrl: `postgresql://postgres.${sandboxRef}@aws-0-eu-north-1.pooler.supabase.com:5432/postgres`,
      })
    ).toBe(sandboxRef);

    expect(() =>
      assertE2ESandboxTarget({
        ...common,
        databaseUrl:
          "postgresql://postgres.jegxfahsvugilbthbked@aws-0-eu-north-1.pooler.supabase.com:5432/postgres",
      })
    ).toThrow(/does not match/);
  });

  it("rejects a production pooler or direct URL even when DATABASE_URL points to staging", () => {
    const databaseUrl = `postgresql://db.${sandboxRef}.supabase.co:5432/postgres`;
    expect(() =>
      assertE2ESandboxTarget({
        ...common,
        supabaseUrl: `https://${sandboxRef}.supabase.co`,
        databaseUrl,
        databaseUrlPool:
          "postgresql://postgres.jegxfahsvugilbthbked@aws-0-eu-north-1.pooler.supabase.com:5432/postgres",
      })
    ).toThrow(/DATABASE_URL_POOL does not match/);

    expect(() =>
      assertE2ESandboxTarget({
        ...common,
        supabaseUrl: `https://${sandboxRef}.supabase.co`,
        databaseUrl,
        databaseUrlDirect:
          "postgresql://db.jegxfahsvugilbthbked.supabase.co:5432/postgres",
      })
    ).toThrow(/DATABASE_URL_DIRECT does not match/);
  });

  it("allows only local Playwright with sandbox database and Stripe test keys", () => {
    expect(
      assertLocalPlaywrightTarget({
        supabaseUrl: `https://${sandboxRef}.supabase.co`,
        databaseUrl: `postgresql://db.${sandboxRef}.supabase.co:5432/postgres`,
        expectedProjectRef: sandboxRef,
        baseUrl: "http://127.0.0.1:3000",
        stripeSecretKey: "sk_test_placeholder",
        stripePublishableKey: "pk_test_placeholder",
      })
    ).toBe(sandboxRef);

    expect(() =>
      assertLocalPlaywrightTarget({
        supabaseUrl: `https://${sandboxRef}.supabase.co`,
        databaseUrl: `postgresql://db.${sandboxRef}.supabase.co:5432/postgres`,
        expectedProjectRef: sandboxRef,
        baseUrl: "https://zaltyko.com",
        stripeSecretKey: "sk_test_placeholder",
        stripePublishableKey: "pk_test_placeholder",
      })
    ).toThrow(/local app/);

    expect(() =>
      assertLocalPlaywrightTarget({
        supabaseUrl: `https://${sandboxRef}.supabase.co`,
        databaseUrl: `postgresql://db.${sandboxRef}.supabase.co:5432/postgres`,
        expectedProjectRef: sandboxRef,
        baseUrl: "http://127.0.0.1:3000",
        stripeSecretKey: ["sk", "live", "placeholder"].join("_"),
        stripePublishableKey: "pk_test_placeholder",
      })
    ).toThrow(/non-test Stripe secret/);
  });
});
