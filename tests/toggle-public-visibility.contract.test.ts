import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public visibility toggle contract", () => {
  it("is an explicit switch and cannot submit a parent form accidentally", () => {
    const source = readFileSync("src/components/admin/TogglePublicVisibility.tsx", "utf8");
    expect(source).toContain('type="button"');
    expect(source).toContain('role="switch"');
    expect(source).toContain("aria-checked={isPublic}");
    expect(source).toContain("aria-label={isPublic");
  });
});
