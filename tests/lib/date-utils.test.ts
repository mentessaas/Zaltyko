import { describe, it, expect } from "vitest";
import {
  isValidDateString,
  validateAndParseDate,
  validateDateWithError,
  formatDateForDB,
} from "@/lib/validation/date-utils";

describe("isValidDateString", () => {
  it("should validate ISO 8601 dates", () => {
    expect(isValidDateString("2024-01-15")).toBe(true);
    expect(isValidDateString("2024-12-31")).toBe(true);
  });

  it("should validate dates with slashes", () => {
    expect(isValidDateString("2024/01/15")).toBe(true);
  });

  it("should reject invalid dates", () => {
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString("invalid")).toBe(false);
    expect(isValidDateString("12345")).toBe(false);
  });

  it("should reject null/undefined", () => {
    expect(isValidDateString(null as any)).toBe(false);
    expect(isValidDateString(undefined as any)).toBe(false);
  });

  it("should reject whitespace-only strings", () => {
    expect(isValidDateString("   ")).toBe(false);
  });
});

describe("validateAndParseDate", () => {
  it("should parse valid ISO dates", () => {
    const result = validateAndParseDate("2024-01-15");
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString().startsWith("2024-01-15")).toBe(true);
  });

  it("should return null for invalid dates", () => {
    expect(validateAndParseDate("invalid")).toBeNull();
    expect(validateAndParseDate("")).toBeNull();
  });

  it("should handle dates with extra whitespace", () => {
    const result = validateAndParseDate("  2024-01-15  ");
    expect(result).toBeInstanceOf(Date);
  });
});

describe("validateDateWithError", () => {
  it("should return success for valid dates", () => {
    const result = validateDateWithError("2024-01-15", "fecha de nacimiento");
    expect(result.success).toBe(true);
    expect(result.date).toBeInstanceOf(Date);
    expect(result.error).toBeNull();
  });

  it("should return error for empty strings", () => {
    const result = validateDateWithError("", "fecha de nacimiento");
    expect(result.success).toBe(false);
    expect(result.date).toBeNull();
    expect(result.error).toContain("no puede estar vacío");
  });

  it("should return error for invalid format", () => {
    const result = validateDateWithError("not-a-date", "fecha");
    expect(result.success).toBe(false);
    expect(result.error).toContain("no es válido");
  });

  it("should return error for years out of range", () => {
    const result = validateDateWithError("1800-01-01", "fecha");
    expect(result.success).toBe(false);
    expect(result.error).toContain("1900 y 2100");
  });

  it("should use custom field name in error message", () => {
    const result = validateDateWithError("", "mi campo");
    expect(result.error).toContain("mi campo");
  });
});

describe("formatDateForDB", () => {
  it("should format Date object to YYYY-MM-DD", () => {
    const date = new Date("2024-01-15");
    expect(formatDateForDB(date)).toBe("2024-01-15");
  });

  it("should format date string to YYYY-MM-DD", () => {
    expect(formatDateForDB("2024-01-15")).toBe("2024-01-15");
    expect(formatDateForDB("January 15, 2024")).toBe("2024-01-15");
  });

  it("should return null for invalid dates", () => {
    expect(formatDateForDB("invalid")).toBeNull();
    expect(formatDateForDB(null)).toBeNull();
    expect(formatDateForDB(undefined)).toBeNull();
  });

  it("should pad single-digit months and days", () => {
    const date = new Date("2024-03-05");
    expect(formatDateForDB(date)).toBe("2024-03-05");
  });
});
