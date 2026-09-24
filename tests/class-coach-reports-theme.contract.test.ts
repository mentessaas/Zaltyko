import fs from "node:fs";
import path from "node:path";

describe("class and coach reports theme", () => {
  it.each([
    "src/components/reports/ClassReport.tsx",
    "src/components/reports/CoachReport.tsx",
  ])("keeps %s status and errors readable in dark mode", (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).toContain("dark:bg-green-950/40 dark:text-green-300");
    expect(source).toContain("dark:bg-red-950/30 dark:text-red-200");
  });
});
