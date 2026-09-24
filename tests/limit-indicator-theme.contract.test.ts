import fs from "node:fs";
import path from "node:path";

describe("plan limit indicator", () => {
  it("keeps limit and upgrade guidance readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/onboarding/LimitIndicator.tsx"), "utf8");
    expect(source).toContain("dark:border-amber-900/60 dark:bg-amber-950/30");
    expect(source).toContain("dark:text-amber-300");
    expect(source).toContain("dark:text-yellow-300");
    expect(source).toContain('type="button"');
  });
});
