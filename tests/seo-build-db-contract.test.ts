import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("SEO build contract", () => {
  it("does not open the database while static cluster pages are generated", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/seo/clusters.ts"), "utf8");
    expect(source.match(/phase-production-build/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("Public cluster pages are prerendered");
  });
});
