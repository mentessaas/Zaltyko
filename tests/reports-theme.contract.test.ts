import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("reports theme", () => {
  it("keeps progress and churn semantics readable in dark mode", () => {
    const progress = readFileSync("src/components/reports/ProgressReport.tsx", "utf8");
    const churn = readFileSync("src/components/reports/ChurnReport.tsx", "utf8");
    const financial = readFileSync("src/components/reports/FinancialReport.tsx", "utf8");
    expect(progress).toContain("dark:bg-green-950/40 dark:text-green-200");
    expect(progress).toContain("dark:bg-red-950/40 dark:text-red-200");
    expect(churn).toContain("dark:bg-yellow-950/40 dark:text-yellow-200");
    expect(churn).toContain("dark:text-red-300");
    expect(financial).toContain("dark:text-yellow-300");
  });
});
