import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { calculateProration } from "@/lib/billing/proration";

/**
 * Integration tests for billing calculations
 */

describe("Billing Calculations Integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Plan upgrade scenarios", () => {
    it("should calculate correct amount for free to pro upgrade mid-cycle", () => {
      vi.setSystemTime(new Date("2024-01-15"));

      const result = calculateProration(
        "free",
        "pro",
        new Date("2024-01-01"),
        new Date("2024-01-31")
      );

      // Free plan: $0, Pro plan: $19/month
      // 16 days remaining out of 30 days
      // Amount due: (19/30) * 16 ≈ $10.13
      expect(result.amountDue).toBeGreaterThan(0);
      expect(result.amountDue).toBeLessThan(19);
      expect(result.credit).toBe(0);
      expect(result.daysRemaining).toBe(16);
    });

    it("should calculate correct amount for pro to premium upgrade", () => {
      vi.setSystemTime(new Date("2024-01-10"));

      const result = calculateProration(
        "pro",
        "premium",
        new Date("2024-01-01"),
        new Date("2024-02-01")
      );

      // Pro: $19, Premium: $49
      // Credit from pro: (19/31) * 22 ≈ $13.48
      // Cost of premium: (49/31) * 22 ≈ $34.77
      // Remaining credit: Math.max(0, 13.48 - 34.77) = 0
      // Amount due: 34.77 - 13.48 ≈ $21.29
      expect(result.amountDue).toBeGreaterThan(0);
      expect(result.credit).toBe(0); // Credit is 0 for upgrades
    });
  });

  describe("Plan downgrade scenarios", () => {
    it("should calculate credit for premium to pro downgrade", () => {
      vi.setSystemTime(new Date("2024-01-15"));

      const result = calculateProration(
        "premium",
        "pro",
        new Date("2024-01-01"),
        new Date("2024-01-31")
      );

      // Premium: $49, Pro: $19
      // Credit: (49/30) * 16 ≈ $26.13
      // Cost: (19/30) * 16 ≈ $10.13
      // Remaining credit: 26.13 - 10.13 ≈ $16
      expect(result.credit).toBeGreaterThan(0);
      expect(result.amountDue).toBe(0);
    });

    it("should not generate negative credits", () => {
      vi.setSystemTime(new Date("2024-01-15"));

      const result = calculateProration(
        "premium",
        "pro",
        new Date("2024-01-01"),
        new Date("2024-01-31")
      );

      expect(result.credit).toBeGreaterThanOrEqual(0);
      expect(result.amountDue).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Edge cases", () => {
    it("should handle upgrade on last day of cycle", () => {
      vi.setSystemTime(new Date("2024-01-31"));

      const result = calculateProration(
        "free",
        "pro",
        new Date("2024-01-01"),
        new Date("2024-01-31")
      );

      expect(result.daysRemaining).toBe(0);
      expect(result.amountDue).toBe(0);
    });

    it("should handle upgrade on first day of cycle", () => {
      vi.setSystemTime(new Date("2024-01-01"));

      const result = calculateProration(
        "free",
        "pro",
        new Date("2024-01-01"),
        new Date("2024-01-31")
      );

      expect(result.daysRemaining).toBe(30);
      expect(result.amountDue).toBe(19); // Full month price
    });

    it("should handle same plan (no change)", () => {
      vi.setSystemTime(new Date("2024-01-15"));

      const result = calculateProration(
        "pro",
        "pro",
        new Date("2024-01-01"),
        new Date("2024-01-31")
      );

      expect(result.amountDue).toBe(0);
      expect(result.credit).toBe(0);
    });
  });
});
