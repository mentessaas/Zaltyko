import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  normalizeEmail,
  validateAndNormalizeEmail,
} from "@/lib/validation/email-utils";

describe("isValidEmail", () => {
  it("should validate correct emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user.name@example.com")).toBe(true);
    expect(isValidEmail("user+tag@example.com")).toBe(true);
    expect(isValidEmail("user@subdomain.example.com")).toBe(true);
  });

  it("should reject invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("invalid")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@.com")).toBe(false);
  });

  it("should reject emails with spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
    expect(isValidEmail("user@ example.com")).toBe(false);
  });

  it("should reject null/undefined", () => {
    expect(isValidEmail(null as any)).toBe(false);
    expect(isValidEmail(undefined as any)).toBe(false);
  });

  it("should reject emails exceeding max length", () => {
    const longEmail = "a".repeat(250) + "@b.com";
    expect(isValidEmail(longEmail)).toBe(false);
  });

  it("should trim whitespace", () => {
    expect(isValidEmail("  user@example.com  ")).toBe(true);
  });
});

describe("normalizeEmail", () => {
  it("should trim and lowercase email", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
  });

  it("should normalize any non-empty string (does not validate format)", () => {
    // normalizeEmail only trims/lowercases, does not validate
    expect(normalizeEmail("invalid")).toBe("invalid");
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("should return null for null/undefined", () => {
    expect(normalizeEmail(null as any)).toBeNull();
    expect(normalizeEmail(undefined as any)).toBeNull();
  });
});

describe("validateAndNormalizeEmail", () => {
  it("should validate and normalize correct emails", () => {
    expect(validateAndNormalizeEmail("User@Example.COM")).toBe("user@example.com");
  });

  it("should return null for invalid emails", () => {
    expect(validateAndNormalizeEmail("invalid")).toBeNull();
    expect(validateAndNormalizeEmail("")).toBeNull();
  });

  it("should handle edge cases", () => {
    expect(validateAndNormalizeEmail("user.name+tag@domain.co.uk")).toBe("user.name+tag@domain.co.uk");
  });
});
