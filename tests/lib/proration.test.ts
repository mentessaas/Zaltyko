import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateProration,
  PLAN_PRICES,
  type ProrationResult,
} from "@/lib/billing/proration";

describe("PLAN_PRICES", () => {
  it("should have correct prices", () => {
    expect(PLAN_PRICES.free).toBe(0);
    expect(PLAN_PRICES.pro).toBe(19);
    expect(PLAN_PRICES.premium).toBe(49);
  });
});

describe("calculateProration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should calculate prorated amount for upgrade", () => {
    vi.setSystemTime(new Date("2024-01-15"));

    const result = calculateProration(
      "free",
      "pro",
      new Date("2024-01-01"),
      new Date("2024-01-31")
    );

    expect(result.amountDue).toBeGreaterThan(0);
    expect(result.credit).toBe(0); // Free plan has no credit
    expect(result.daysRemaining).toBeGreaterThan(0);
    expect(result.totalDays).toBe(30);
    expect(result.prorationDate).toBeInstanceOf(Date);
  });

  it("should calculate credit for downgrade", () => {
    vi.setSystemTime(new Date("2024-01-15"));

    const result = calculateProration(
      "premium",
      "pro",
      new Date("2024-01-01"),
      new Date("2024-01-31")
    );

    expect(result.credit).toBeGreaterThan(0);
    expect(result.amountDue).toBe(0); // Credit covers the downgrade
  });

  it("should handle same-plan change", () => {
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

  it("should handle unknown plan gracefully", () => {
    vi.setSystemTime(new Date("2024-01-15"));

    const result = calculateProration(
      "unknown",
      "pro",
      new Date("2024-01-01"),
      new Date("2024-01-31")
    );

    expect(result).toBeDefined();
    expect(typeof result.amountDue).toBe("number");
    expect(typeof result.credit).toBe("number");
  });

  it("should handle end of cycle (no days remaining)", () => {
    vi.setSystemTime(new Date("2024-01-31"));

    const result = calculateProration(
      "pro",
      "premium",
      new Date("2024-01-01"),
      new Date("2024-01-31")
    );

    expect(result.daysRemaining).toBe(0);
    expect(result.amountDue).toBe(0);
    expect(result.credit).toBe(0); // No days remaining means no credit
  });

  it("should round amounts to 2 decimal places", () => {
    vi.setSystemTime(new Date("2024-01-10"));

    const result = calculateProration(
      "pro",
      "premium",
      new Date("2024-01-01"),
      new Date("2024-02-01")
    );

    // Check that decimal places are limited to 2
    const decimalPlaces = (n: number) => {
      const str = n.toString();
      const dotIndex = str.indexOf(".");
      return dotIndex === -1 ? 0 : str.length - dotIndex - 1;
    };

    expect(decimalPlaces(result.amountDue)).toBeLessThanOrEqual(2);
    expect(decimalPlaces(result.credit)).toBeLessThanOrEqual(2);
  });

  it("should handle free to premium upgrade", () => {
    vi.setSystemTime(new Date("2024-01-15"));

    const result = calculateProration(
      "free",
      "premium",
      new Date("2024-01-01"),
      new Date("2024-01-31")
    );

    expect(result.credit).toBe(0);
    expect(result.amountDue).toBeGreaterThan(0);
  });
});
