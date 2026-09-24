import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("my dashboard theme", () => {
  it("keeps pending payment alert readable in dark mode", () => {
    const source = readFileSync("src/app/app/[academyId]/my-dashboard/MyDashboardPage.tsx", "utf8");
    expect(source).toContain("dark:from-amber-950/50");
    expect(source).toContain("dark:text-amber-100");
    expect(source).toContain("dark:text-amber-200");
    expect(source).toContain("dark:bg-amber-600");
  });
});
