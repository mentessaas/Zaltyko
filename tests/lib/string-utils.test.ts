import { describe, it, expect } from "vitest";
import {
  capitalize,
  slugify,
  truncate,
  escapeHtml,
  formatPhone,
  getInitials,
} from "@/lib/string-utils";

describe("capitalize", () => {
  it("should capitalize first letter", () => {
    expect(capitalize("hello")).toBe("Hello");
    expect(capitalize("world")).toBe("World");
  });

  it("should handle already capitalized strings", () => {
    expect(capitalize("Hello")).toBe("Hello");
  });

  it("should return empty string for empty input", () => {
    expect(capitalize("")).toBe("");
  });

  it("should handle single character", () => {
    expect(capitalize("a")).toBe("A");
  });
});

describe("slugify", () => {
  it("should convert string to lowercase slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("Test String")).toBe("test-string");
  });

  it("should remove special characters", () => {
    expect(slugify("Hello! World?")).toBe("hello-world");
    expect(slugify("test@example")).toBe("testexample");
  });

  it("should replace spaces and underscores with hyphens", () => {
    expect(slugify("hello_world")).toBe("hello-world");
    expect(slugify("hello  world")).toBe("hello-world");
  });

  it("should trim leading and trailing hyphens", () => {
    expect(slugify("  hello  ")).toBe("hello");
    expect(slugify("hello world ")).toBe("hello-world");
  });

  it("should handle accented characters correctly", () => {
    // Accents should be stripped, not converted to wrong letters
    expect(slugify("María García")).toBe("maria-garcia");
    expect(slugify("José González")).toBe("jose-gonzalez");
    expect(slugify("Niño")).toBe("nino");
  });

  it("should handle empty string", () => {
    expect(slugify("")).toBe("");
  });
});

describe("truncate", () => {
  it("should truncate strings longer than maxLength", () => {
    expect(truncate("Hello World", 8)).toBe("Hello Wo...");
  });

  it("should not modify strings within maxLength", () => {
    expect(truncate("Hello", 10)).toBe("Hello");
  });

  it("should not modify strings equal to maxLength", () => {
    expect(truncate("Hello", 5)).toBe("Hello");
  });

  it("should handle empty string", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("should handle maxLength of 0", () => {
    expect(truncate("Hello", 0)).toBe("...");
  });

  it("should handle maxLength smaller than suffix length", () => {
    // With maxLength=1: slice(0,1) = "H", result = "H" + "..."
    expect(truncate("Hello", 1)).toBe("H...");
    // With maxLength=2: slice(0,2) = "He", result = "He" + "..."
    expect(truncate("Hello", 2)).toBe("He...");
  });
});

describe("escapeHtml", () => {
  it("should escape HTML entities", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });

  it("should escape double quotes", () => {
    expect(escapeHtml('"Hello"')).toBe("&quot;Hello&quot;");
  });

  it("should escape single quotes", () => {
    expect(escapeHtml("'Hello'")).toBe("&#039;Hello&#039;");
  });

  it("should escape all HTML entities at once", () => {
    expect(escapeHtml("<div class='test'>&amp;</div>")).toBe(
      "&lt;div class=&#039;test&#039;&gt;&amp;amp;&lt;/div&gt;"
    );
  });

  it("should return empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("should return same string when no HTML to escape", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});

describe("formatPhone", () => {
  it("should format 9-digit phone number with spaces", () => {
    // Regex matches first 9 digits and reformats them
    expect(formatPhone("123456789")).toBe("123 456 789");
  });

  it("should format phone with extra digits (keeps remaining digits)", () => {
    // 10 digits: first 9 get reformatted, 10th is kept
    expect(formatPhone("1234567890")).toBe("123 456 7890");
  });

  it("should format phone with plus prefix", () => {
    // Plus sign is kept, digits after are formatted
    expect(formatPhone("+123456789")).toBe("+123 456 789");
  });

  it("should return original for short numbers", () => {
    // Less than 9 digits - no match, returns original
    expect(formatPhone("123456")).toBe("123456");
  });
});

describe("getInitials", () => {
  it("should return initials from full name", () => {
    expect(getInitials("John Doe")).toBe("JD");
    expect(getInitials("María García López")).toBe("ML");
  });

  it("should return first letter for single word name", () => {
    expect(getInitials("John")).toBe("J");
    expect(getInitials("María")).toBe("M");
  });

  it("should handle lowercase names", () => {
    expect(getInitials("john doe")).toBe("JD");
  });

  it("should handle names with extra spaces", () => {
    expect(getInitials("  John   Doe  ")).toBe("JD");
  });

  it("should return empty string for null/undefined/empty", () => {
    expect(getInitials(null as any)).toBe("");
    expect(getInitials(undefined as any)).toBe("");
    expect(getInitials("")).toBe("");
    expect(getInitials("   ")).toBe("");
  });
});