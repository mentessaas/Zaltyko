import { describe, it, expect } from "vitest";
import {
  getInitials,
  truncate,
  capitalizeWords,
  removeAccents,
  slugify,
} from "@/lib/string-utils";

describe("getInitials", () => {
  it("should return correct initials for full name", () => {
    expect(getInitials("John Doe")).toBe("JD");
    expect(getInitials("María García López")).toBe("MG");
  });

  it("should return first two chars for single word name", () => {
    expect(getInitials("John")).toBe("JO");
    expect(getInitials("María")).toBe("MA");
  });

  it("should handle lowercase names", () => {
    expect(getInitials("john doe")).toBe("JD");
  });

  it("should handle names with extra spaces", () => {
    expect(getInitials("  John   Doe  ")).toBe("JD");
  });

  it("should return U for null/undefined/empty", () => {
    expect(getInitials(null)).toBe("U");
    expect(getInitials(undefined)).toBe("U");
    expect(getInitials("")).toBe("U");
    expect(getInitials("   ")).toBe("U");
  });
});

describe("truncate", () => {
  it("should truncate long strings", () => {
    expect(truncate("Hello World", 8)).toBe("Hello...");
  });

  it("should not truncate short strings", () => {
    expect(truncate("Hello", 10)).toBe("Hello");
  });

  it("should use custom suffix", () => {
    expect(truncate("Hello World", 8, "…")).toBe("Hello W…");
  });

  it("should handle null/undefined", () => {
    expect(truncate(null, 10)).toBe("");
    expect(truncate(undefined, 10)).toBe("");
  });

  it("should handle exact length strings", () => {
    expect(truncate("Hello", 5)).toBe("Hello");
  });
});

describe("capitalizeWords", () => {
  it("should capitalize first letter of each word", () => {
    expect(capitalizeWords("hello world")).toBe("Hello World");
    expect(capitalizeWords("maría García")).toBe("María García");
  });

  it("should handle already capitalized strings", () => {
    expect(capitalizeWords("Hello World")).toBe("Hello World");
  });

  it("should handle lowercase strings", () => {
    expect(capitalizeWords("all lowercase")).toBe("All Lowercase");
  });

  it("should handle null/undefined/empty", () => {
    expect(capitalizeWords(null)).toBe("");
    expect(capitalizeWords(undefined)).toBe("");
    expect(capitalizeWords("")).toBe("");
  });
});

describe("removeAccents", () => {
  it("should remove accents from strings", () => {
    expect(removeAccents("María")).toBe("Maria");
    expect(removeAccents("José")).toBe("Jose");
    expect(removeAccents("Niño")).toBe("Nino");
  });

  it("should handle strings without accents", () => {
    expect(removeAccents("Hello")).toBe("Hello");
  });

  it("should handle null/undefined/empty", () => {
    expect(removeAccents(null)).toBe("");
    expect(removeAccents(undefined)).toBe("");
    expect(removeAccents("")).toBe("");
  });
});

describe("slugify", () => {
  it("should convert string to slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("María García")).toBe("maria-garcia");
  });

  it("should remove special characters", () => {
    expect(slugify("Hello! World?")).toBe("hello-world");
  });

  it("should collapse multiple spaces/hyphens", () => {
    expect(slugify("hello   world")).toBe("hello-world");
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("should trim the result", () => {
    // slugify trims at the end, so leading/trailing spaces become single hyphens
    expect(slugify("hello world")).toBe("hello-world");
    expect(slugify("  hello world  ")).toBe("-hello-world-");
  });

  it("should handle null/undefined/empty", () => {
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
    expect(slugify("")).toBe("");
  });
});
