import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("onboarding dark mode contract", () => {
  it("uses theme tokens instead of fixed white backgrounds and navy text", () => {
    for (const file of ["parent", "coach", "athlete"]) {
      const source = readFileSync(`src/app/(site)/onboarding/${file}/page.tsx`, "utf8");
      expect(source).toContain("bg-background");
      expect(source).toContain("text-foreground");
      expect(source).not.toContain("bg-zaltyko-white");
      expect(source).not.toContain("text-zaltyko-navy");
    }
  });
});
