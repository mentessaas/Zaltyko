import fs from "node:fs";
import path from "node:path";

describe("family dashboard theme", () => {
  it("keeps attendance badges and rate readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/my-dashboard/MyAttendanceWidget.tsx"), "utf8");
    expect(source).toContain("dark:bg-red-950/40 dark:text-red-300");
    expect(source).toContain("text-emerald-600 dark:text-emerald-300");
  });

  it("keeps payment status cards and action errors readable", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/my-dashboard/MyPaymentsWidget.tsx"), "utf8");
    expect(source).toContain("bg-red-50 dark:bg-red-950/40");
    expect(source).toContain('role="alert"');
  });
});
