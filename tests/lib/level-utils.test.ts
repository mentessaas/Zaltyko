import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatDob,
  parseLevel,
  composeLevelLabel,
  calculateAgeFromString,
  formatAge,
} from "@/lib/athletes/level-utils";
import { calculateAge } from "@/lib/date-utils";

// Ensure fake timers are always restored after each test
afterEach(() => {
  vi.useRealTimers();
});

describe("formatDob", () => {
  it("should return empty string for null", () => {
    expect(formatDob(null)).toBe("");
  });

  it("should truncate strings longer than 10 chars", () => {
    expect(formatDob("2024-01-15T00:00:00")).toBe("2024-01-15");
  });

  it("should return empty string for short strings", () => {
    expect(formatDob("2024-0")).toBe("");
    expect(formatDob("2024")).toBe("");
  });

  it("should return the string if exactly 10 chars", () => {
    expect(formatDob("2024-01-15")).toBe("2024-01-15");
  });
});

describe("parseLevel", () => {
  it("should parse category and level from combined string", () => {
    const result = parseLevel("Categoría A - Nivel 1");
    expect(result.category).toBe("A");
    expect(result.level).toBe("1");
  });

  it("should parse FIG level", () => {
    const result = parseLevel("Categoría B - FIG");
    expect(result.category).toBe("B");
    expect(result.level).toBe("FIG");
  });

  it("should parse Pre-nivel", () => {
    const result = parseLevel("Categoría C - Pre-nivel");
    expect(result.category).toBe("C");
    expect(result.level).toBe("Pre-nivel");
  });

  it("should handle case-insensitive matching", () => {
    const result = parseLevel("categoría a - nivel 2");
    expect(result.category).toBe("A");
    expect(result.level).toBe("2");
  });

  it("should return empty strings for null/undefined", () => {
    expect(parseLevel(null)).toEqual({ category: "", level: "" });
    expect(parseLevel(undefined)).toEqual({ category: "", level: "" });
  });

  it("should handle strings without category", () => {
    const result = parseLevel("Nivel 5");
    expect(result.category).toBe("");
    expect(result.level).toBe("5");
  });

  it("should handle invalid category", () => {
    const result = parseLevel("Categoría Z - Nivel 1");
    expect(result.category).toBe("");
  });
});

describe("composeLevelLabel", () => {
  it("should compose label with both category and level", () => {
    const result = composeLevelLabel("A", "1");
    expect(result).toBe("Categoría A · Nivel 1");
  });

  it("should compose label with category only", () => {
    const result = composeLevelLabel("B", "");
    expect(result).toBe("Categoría B");
  });

  it("should compose label with level only", () => {
    const result = composeLevelLabel("", "FIG");
    expect(result).toBe("FIG");
  });

  it("should return null when both are empty", () => {
    expect(composeLevelLabel("", "")).toBeNull();
  });

  it("should handle Pre-nivel correctly", () => {
    const result = composeLevelLabel("A", "Pre-nivel");
    expect(result).toBe("Categoría A · Pre-nivel");
  });
});

describe("calculateAgeFromString", () => {
  it("should calculate age correctly for past birthdays", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15"));

    expect(calculateAgeFromString("2000-01-01")).toBe(26);
    expect(calculateAgeFromString("2000-12-31")).toBe(25);

    vi.useRealTimers();
  });

  it("should return 0 for invalid date strings (not null)", () => {
    // calculateAge returns 0 for invalid dates, so calculateAgeFromString also returns 0
    expect(calculateAgeFromString("invalid")).toBe(0);
  });

  it("should return null for empty/falsy values", () => {
    expect(calculateAgeFromString("")).toBeNull();
    expect(calculateAgeFromString(null)).toBeNull();
    expect(calculateAgeFromString(undefined)).toBeNull();
  });

  it("should return non-negative age for future birthdays", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26"));

    const today = new Date().toISOString().split("T")[0];
    const age = calculateAgeFromString(today);
    expect(age).toBeGreaterThanOrEqual(0);

    vi.useRealTimers();
  });

  it("should handle leap year birthdays", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01"));
    // March 1 > February 29, so birthday has occurred
    expect(calculateAgeFromString("2000-02-29")).toBe(26);
    vi.useRealTimers();
  });
});

describe("formatAge", () => {
  it("should format age with años suffix", () => {
    expect(formatAge(25)).toBe("25 años");
    expect(formatAge(0)).toBe("0 años");
  });

  it("should return empty string for null", () => {
    expect(formatAge(null)).toBe("");
  });

  it("should handle negative ages gracefully", () => {
    expect(formatAge(-1)).toBe("-1 años");
  });
});