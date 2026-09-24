import fs from "node:fs";
import path from "node:path";

describe("reports theme consistency", () => {
  it("keeps financial report warnings and KPI colors readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/reports/FinancialReport.tsx"), "utf8");
    expect(source).toContain("dark:bg-red-950/30 dark:text-red-200");
    expect(source).toContain("dark:text-yellow-300");
    expect(source).toContain("dark:text-red-300");
  });

  it("uses semantic surfaces for attendance bars and badges", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/reports/AttendanceReport.tsx"), "utf8");
    expect(source).toContain("bg-green-50 dark:bg-green-950/40");
    expect(source).toContain("bg-muted rounded-full h-2");
  });
});
