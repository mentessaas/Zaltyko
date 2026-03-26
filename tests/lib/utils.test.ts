import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn utility", () => {
  it("should merge class names with tailwind-merge", () => {
    const result = cn("text-red-500", "bg-blue-500");
    expect(result).toContain("text-red-500");
    expect(result).toContain("bg-blue-500");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    const result = cn("base-class", isActive && "active-class", !isActive && "inactive-class");
    expect(result).toContain("base-class");
    expect(result).toContain("active-class");
    expect(result).not.toContain("inactive-class");
  });

  it("should handle falsy values", () => {
    const result = cn("base", false, null, undefined, "", 0);
    expect(result).toBe("base");
  });

  it("should merge conflicting tailwind classes correctly", () => {
    const result = cn("text-red-500", "text-blue-500");
    expect(result).toContain("text-blue-500");
  });

  it("should handle empty input", () => {
    expect(cn()).toBe("");
    expect(cn("")).toBe("");
  });

  it("should handle array input", () => {
    const classes = ["class1", "class2"];
    const result = cn(classes);
    expect(result).toContain("class1");
    expect(result).toContain("class2");
  });
});
