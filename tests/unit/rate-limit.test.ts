import { describe, it, expect } from "vitest";
import {
  RATE_LIMITS,
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
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
});
