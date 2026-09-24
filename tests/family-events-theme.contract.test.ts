import fs from "node:fs";
import path from "node:path";

describe("family events theme", () => {
  it("keeps registration statuses and summary cards readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/app/[academyId]/my-events/page.tsx"), "utf8");
    expect(source).toContain("dark:bg-orange-950/40 dark:text-orange-300");
    expect(source).toContain("dark:border-yellow-900/60 dark:bg-yellow-950/30");
  });

  it("keeps event registration outcomes readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/app/[academyId]/events/[eventId]/register/page.tsx"), "utf8");
    expect(source).toContain("dark:bg-green-950/30");
    expect(source).toContain("dark:bg-amber-950/30");
  });
});
