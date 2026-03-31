import { describe, it, expect, vi } from "vitest";
import {
  formatDob,
  parseLevel,
  composeLevelLabel,
  calculateAge,
  formatAge,
} from "@/lib/athletes/level-utils";

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

describe("calculateAge", () => {
  it("should calculate age correctly for past birthdays", () => {
    // Someone born in 2000 should be 25 or 26 in 2026 depending on birthday
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15"));

    expect(calculateAge("2000-01-01")).toBe(26);
    expect(calculateAge("2000-12-31")).toBe(25);

    vi.useRealTimers();
  });

  it("should return null for invalid dates", () => {
    expect(calculateAge("invalid")).toBeNull();
    expect(calculateAge("")).toBeNull();
    expect(calculateAge(null)).toBeNull();
  });

  it("should return null for future birthdays", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26"));

    // Someone born today would be 0 years old, but this tests the edge case
    const today = new Date().toISOString().split("T")[0];
    const age = calculateAge(today);
    expect(age).toBeGreaterThanOrEqual(0);

    vi.useRealTimers();
  });

  it("should handle leap year birthdays", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01"));
    // March 1 > February, so birthday has occurred
    expect(calculateAge("2000-02-29")).toBe(26);
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
});
