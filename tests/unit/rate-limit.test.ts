import { afterEach, describe, it, expect, vi } from "vitest";
import {
  RATE_LIMITS,
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
} from "@/lib/rate-limit";

describe("Rate Limiting", () => {
  describe("getLimitForRoute", () => {
    it("should return correct limits for billing endpoints", () => {
      const limits = getLimitForRoute("/api/billing/checkout");
      expect(limits.limit).toBe(10);
      expect(limits.window).toBe(60);
    });

    it("should return correct limits for webhook endpoints", () => {
      const limits = getLimitForRoute("/api/stripe/webhook");
      expect(limits.limit).toBe(1000);
      expect(limits.window).toBe(60);
    });

    it("should return default limits for unknown routes", () => {
      const limits = getLimitForRoute("/api/unknown");
      expect(limits.limit).toBe(100);
      expect(limits.window).toBe(60);
    });
  });

  describe("RATE_LIMITS presets", () => {
    it("should have correct PUBLIC preset", () => {
      expect(RATE_LIMITS.PUBLIC.limit).toBe(100);
      expect(RATE_LIMITS.PUBLIC.window).toBe(60);
    });

    it("should have correct AUTHENTICATED preset", () => {
      expect(RATE_LIMITS.AUTHENTICATED.limit).toBe(300);
      expect(RATE_LIMITS.AUTHENTICATED.window).toBe(60);
    });

    it("should have correct CRITICAL preset", () => {
      expect(RATE_LIMITS.CRITICAL.limit).toBe(10);
      expect(RATE_LIMITS.CRITICAL.window).toBe(60);
    });

    it("should have correct STRICT preset", () => {
      expect(RATE_LIMITS.STRICT.limit).toBe(5);
      expect(RATE_LIMITS.STRICT.window).toBe(60);
    });
  });

  describe("verified tenant identifiers", () => {
    it("includes route, server-resolved tenant and client IP", () => {
      const request = new Request("https://zaltyko.test/api/athletes", {
        headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" },
      });

      expect(getVerifiedTenantRateLimitIdentifier(request, "tenant-1")).toBe(
        "/api/athletes:tenant:tenant-1:ip:203.0.113.8"
      );
    });
  });

  describe("production fallback", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("fails closed without KV in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("KV_REST_API_URL", "");
      vi.stubEnv("KV_REST_API_TOKEN", "");

      const result = await rateLimit({ identifier: "prod", limit: 10, window: 60 });

      expect(result.success).toBe(false);
    });

    it("allows only the explicitly isolated GitHub E2E sandbox when KV is absent", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("CI", "true");
      vi.stubEnv("GITHUB_ACTIONS", "true");
      vi.stubEnv("E2E_RATE_LIMIT_BYPASS", "true");
      vi.stubEnv("E2E_TARGET_SUPABASE_PROJECT_REF", "aeeootdmuiqkfeernskw");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://aeeootdmuiqkfeernskw.supabase.co");
      vi.stubEnv("KV_REST_API_URL", "");
      vi.stubEnv("KV_REST_API_TOKEN", "");

      const result = await rateLimit({ identifier: "sandbox", limit: 10, window: 60 });

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(10);
    });

    it("does not bypass rate limits for production deployments or another Supabase project", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("CI", "true");
      vi.stubEnv("GITHUB_ACTIONS", "true");
      vi.stubEnv("E2E_RATE_LIMIT_BYPASS", "true");
      vi.stubEnv("E2E_TARGET_SUPABASE_PROJECT_REF", "aeeootdmuiqkfeernskw");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://aeeootdmuiqkfeernskw.supabase.co");
      vi.stubEnv("KV_REST_API_URL", "");
      vi.stubEnv("KV_REST_API_TOKEN", "");

      const result = await rateLimit({ identifier: "not-sandbox", limit: 10, window: 60 });

      expect(result.success).toBe(false);
    });
  });
});
