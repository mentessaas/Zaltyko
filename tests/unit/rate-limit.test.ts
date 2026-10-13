import { afterEach, describe, it, expect, vi } from "vitest";
import {
  RATE_LIMITS,
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  isLocalE2ERateLimitAdapterEnabled,
  rateLimit,
} from "@/lib/rate-limit";

const kvMock = vi.hoisted(() => ({
  zremrangebyscore: vi.fn(),
  zcard: vi.fn(),
  zrange: vi.fn(),
  zadd: vi.fn(),
  expire: vi.fn(),
}));

vi.mock("@vercel/kv", () => ({ kv: kvMock }));

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
      vi.restoreAllMocks();
      for (const mock of Object.values(kvMock)) mock.mockClear();
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
      vi.stubEnv("E2E_RATE_LIMIT_BYPASS", "true");
      vi.stubEnv("E2E_TARGET_SUPABASE_PROJECT_REF", "aeeootdmuiqkfeernskw");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://aeeootdmuiqkfeernskw.supabase.co");
      vi.stubEnv("KV_REST_API_URL", "");
      vi.stubEnv("KV_REST_API_TOKEN", "");

      const result = await rateLimit({ identifier: "not-sandbox", limit: 10, window: 60 });

      expect(result.success).toBe(false);

      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("E2E_TARGET_SUPABASE_PROJECT_REF", "another-supabase-project");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://another-supabase-project.supabase.co");

      const wrongSandbox = await rateLimit({ identifier: "wrong-sandbox", limit: 10, window: 60 });

      expect(wrongSandbox.success).toBe(false);
    });

    it("uses the in-memory adapter only for production-mode local E2E against loopback Supabase", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("E2E_LOCAL_SUPABASE", "true");
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
      vi.stubEnv("KV_REST_API_URL", "");
      vi.stubEnv("KV_REST_API_TOKEN", "");

      expect(isLocalE2ERateLimitAdapterEnabled()).toBe(true);
      const result = await rateLimit({ identifier: "local-e2e", limit: 10, window: 60 });
      expect(result.success).toBe(true);
      expect(kvMock.zremrangebyscore).not.toHaveBeenCalled();
      expect(kvMock.zcard).not.toHaveBeenCalled();
      expect(kvMock.zrange).not.toHaveBeenCalled();
      expect(kvMock.zadd).not.toHaveBeenCalled();
      expect(kvMock.expire).not.toHaveBeenCalled();
    });

    it("enforces the local E2E sliding window per identifier and expires old events", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("E2E_LOCAL_SUPABASE", "true");
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
      vi.stubEnv("KV_REST_API_URL", "");
      vi.stubEnv("KV_REST_API_TOKEN", "");
      vi.spyOn(Date, "now")
        .mockReturnValueOnce(1_000_000)
        .mockReturnValueOnce(1_001_000)
        .mockReturnValueOnce(1_001_000)
        .mockReturnValueOnce(1_001_000)
        .mockReturnValueOnce(1_006_000);

      const config = { limit: 2, window: 5 };
      expect(await rateLimit({ ...config, identifier: "local-a" })).toMatchObject({
        success: true,
        remaining: 1,
      });
      expect(await rateLimit({ ...config, identifier: "local-a" })).toMatchObject({
        success: true,
        remaining: 0,
      });
      expect(await rateLimit({ ...config, identifier: "local-a" })).toMatchObject({
        success: false,
        remaining: 0,
        reset: 1005,
      });
      expect(await rateLimit({ ...config, identifier: "local-b" })).toMatchObject({
        success: true,
        remaining: 1,
      });
      expect(await rateLimit({ ...config, identifier: "local-a" })).toMatchObject({
        success: true,
        remaining: 1,
      });
    });

    it("rejects local rate-limit bypass on Vercel and for non-loopback targets", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("E2E_LOCAL_SUPABASE", "true");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("VERCEL_ENV", "");
      expect(isLocalE2ERateLimitAdapterEnabled()).toBe(false);

      vi.stubEnv("VERCEL", "");
      vi.stubEnv("VERCEL_ENV", "preview");
      expect(isLocalE2ERateLimitAdapterEnabled()).toBe(false);

      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
      expect(isLocalE2ERateLimitAdapterEnabled()).toBe(false);
    });
  });
});
