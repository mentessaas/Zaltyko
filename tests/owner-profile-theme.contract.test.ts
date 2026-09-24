import fs from "node:fs";
import path from "node:path";

describe("owner profile theme", () => {
  it("keeps plan limit and trial notices readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/profiles/OptimizedOwnerProfile.tsx"), "utf8");
    expect(source).toContain("dark:text-amber-200");
    expect(source).toContain("dark:text-amber-300");
    expect(source).toContain("dark:bg-amber-950/30");
  });

  it("keeps missing-profile notices readable", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/dashboard/profile/page.tsx"), "utf8");
    expect(source).toContain("text-amber-900 dark:text-amber-200");
  });
});
