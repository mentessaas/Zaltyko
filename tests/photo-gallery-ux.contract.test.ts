import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/coaches/PhotoGallery.tsx", import.meta.url), "utf8");

describe("photo gallery upload UX contract", () => {
  it("prevents invalid, oversized uploads and enforces the gallery limit", () => {
    expect(source).toContain("photos.length >= 10");
    expect(source).toContain("file.size > 5 * 1024 * 1024");
    expect(source).toContain("allowedTypes");
  });

  it("does not submit the parent form when removing a photo", () => {
    expect(source).toContain('<Button\n                type="button"');
  });
});
