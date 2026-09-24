import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile navigation theme contract", () => {
  it("uses semantic surfaces and explicit button types", () => {
    for (const file of ["src/components/navigation/MobileAcademyNav.tsx", "src/components/navigation/BottomNav.tsx"]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source, file).not.toContain("bg-white/95");
      expect(source, file).toContain('type="button"');
      expect(source, file).toContain("bg-card/95");
    }
  });
});
