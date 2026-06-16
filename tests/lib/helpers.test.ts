import { describe, it, expect } from "vitest";
import { escapeLikeSearch } from "@/lib/helpers";

describe("escapeLikeSearch", () => {
  it("should escape % character", () => {
    expect(escapeLikeSearch("hello%world")).toBe("hello\\%world");
  });

  it("should escape _ character", () => {
    expect(escapeLikeSearch("hello_world")).toBe("hello\\_world");
  });

  it("should escape \\ character", () => {
    expect(escapeLikeSearch("hello\\world")).toBe("hello\\\\world");
  });

  it("should escape multiple special characters", () => {
    expect(escapeLikeSearch("50%_test")).toBe("50\\%\\_test");
    expect(escapeLikeSearch("100%_great_test")).toBe("100\\%\\_great\\_test");
  });

  it("should not modify strings without special characters", () => {
    expect(escapeLikeSearch("hello world")).toBe("hello world");
    expect(escapeLikeSearch("test123")).toBe("test123");
  });

  it("should handle empty string", () => {
    expect(escapeLikeSearch("")).toBe("");
  });

  it("should handle string with only special characters", () => {
    expect(escapeLikeSearch("%%__\\\\")).toBe("\\%\\%\\_\\_\\\\\\\\");
  });
});