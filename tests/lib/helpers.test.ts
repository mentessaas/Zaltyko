import { describe, it, expect } from "vitest";
import {
  escapeLikeSearch,
  safeNumberParse,
  parsePaginationParams,
} from "@/lib/helpers";

describe("escapeLikeSearch", () => {
  it("should escape % and _ characters", () => {
    expect(escapeLikeSearch("hello%world")).toBe("hello\\%world");
    expect(escapeLikeSearch("hello_world")).toBe("hello\\_world");
  });

  it("should escape multiple special characters", () => {
    expect(escapeLikeSearch("50%_test")).toBe("50\\%\\_test");
  });

  it("should not modify strings without special characters", () => {
    expect(escapeLikeSearch("hello world")).toBe("hello world");
  });

  it("should handle empty string", () => {
    expect(escapeLikeSearch("")).toBe("");
  });
});

describe("safeNumberParse", () => {
  it("should parse valid numbers", () => {
    expect(safeNumberParse("123")).toBe(123);
    expect(safeNumberParse("0")).toBe(0);
    expect(safeNumberParse("-42")).toBe(-42);
  });

  it("should return undefined for invalid strings", () => {
    expect(safeNumberParse("abc")).toBeUndefined();
    expect(safeNumberParse("")).toBeUndefined();
  });

  it("should parse integers even with decimal strings", () => {
    // parseInt parses up to the first non-numeric character
    expect(safeNumberParse("12.34")).toBe(12);
  });

  it("should return undefined for null/undefined", () => {
    expect(safeNumberParse(null)).toBeUndefined();
    expect(safeNumberParse(undefined)).toBeUndefined();
  });

  it("should handle whitespace", () => {
    expect(safeNumberParse("  42  ")).toBe(42);
  });
});

describe("parsePaginationParams", () => {
  it("should use default values when params are missing", () => {
    const result = parsePaginationParams(undefined, undefined);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("should parse valid page and limit", () => {
    const result = parsePaginationParams("3", "50");
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(100);
  });

  it("should enforce minimum page of 1", () => {
    const result = parsePaginationParams("0", "20");
    expect(result.page).toBe(1);
  });

  it("should enforce minimum limit of 1", () => {
    const result = parsePaginationParams("1", "0");
    expect(result.limit).toBe(1);
  });

  it("should enforce max limit", () => {
    const result = parsePaginationParams("1", "500");
    expect(result.limit).toBe(100); // default maxLimit
  });

  it("should respect custom maxLimit", () => {
    const result = parsePaginationParams("1", "200", 50);
    expect(result.limit).toBe(50);
  });

  it("should respect custom defaultLimit", () => {
    const result = parsePaginationParams(undefined, undefined, 100, 30);
    expect(result.limit).toBe(30);
  });

  it("should calculate correct offset", () => {
    const result = parsePaginationParams("5", "10");
    expect(result.offset).toBe(40); // (5-1) * 10
  });

  it("should handle invalid params gracefully", () => {
    const result = parsePaginationParams("abc", "xyz");
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
});
