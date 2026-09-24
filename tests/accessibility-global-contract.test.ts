import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("accessibility global contract", () => {
  it("respects reduced motion and keeps focused controls visible", () => {
    const skipLink = readFileSync(join(process.cwd(), "src/components/ui/skip-link.tsx"), "utf8");
    const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(skipLink).toContain("prefers-reduced-motion");
    expect(skipLink).toContain('behavior: reducedMotion ? "auto" : "smooth"');
    expect(styles).toContain("scroll-margin-top: 5rem");
  });
});
