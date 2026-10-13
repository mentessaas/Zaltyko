import { describe, expect, it } from "vitest";

import { getLocalSupabaseCspConnectSources } from "@/lib/security/local-supabase-csp";

describe("local Supabase CSP origin", () => {
  it("allows the exact loopback origin only for the isolated local E2E runner", () => {
    expect(
      getLocalSupabaseCspConnectSources({
        nodeEnv: "production",
        isolatedE2e: "true",
        supabaseUrl: "http://127.0.0.1:54321",
      })
    ).toEqual(["http://127.0.0.1:54321", "ws://127.0.0.1:54321"]);
  });

  it("allows loopback IPv6 in development and rejects URL credentials", () => {
    expect(
      getLocalSupabaseCspConnectSources({
        nodeEnv: "development",
        supabaseUrl: "http://[::1]:54321",
      })
    ).toEqual(["http://[::1]:54321", "ws://[::1]:54321"]);
    expect(
      getLocalSupabaseCspConnectSources({
        nodeEnv: "production",
        isolatedE2e: "true",
        supabaseUrl: "http://user:pass@127.0.0.1:54321",
      })
    ).toEqual([]);
  });

  it("does not expose loopback in production without the E2E marker", () => {
    expect(
      getLocalSupabaseCspConnectSources({
        nodeEnv: "production",
        supabaseUrl: "http://127.0.0.1:54321",
      })
    ).toEqual([]);
  });

  it("cannot be enabled on Vercel even when the marker is present", () => {
    expect(
      getLocalSupabaseCspConnectSources({
        nodeEnv: "production",
        isolatedE2e: "true",
        vercel: "1",
        supabaseUrl: "http://127.0.0.1:54321",
      })
    ).toEqual([]);
    expect(
      getLocalSupabaseCspConnectSources({
        nodeEnv: "production",
        isolatedE2e: "true",
        vercelEnv: "preview",
        supabaseUrl: "http://127.0.0.1:54321",
      })
    ).toEqual([]);
  });

  it("rejects remote, malformed, and non-HTTP Supabase origins", () => {
    for (const supabaseUrl of [
      "https://project.supabase.co",
      "not a URL",
      "ftp://localhost:54321",
    ]) {
      expect(
        getLocalSupabaseCspConnectSources({
          nodeEnv: "production",
          isolatedE2e: "true",
          supabaseUrl,
        })
      ).toEqual([]);
    }
  });
});
