import fs from "node:fs";
import path from "node:path";

describe("academy announcements theme", () => {
  it.each([
    "src/app/app/[academyId]/announcements/page.tsx",
    "src/app/app/[academyId]/announcements/[id]/page.tsx",
  ])("keeps announcement status colors readable in %s", (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).toContain("dark:bg-red-950/40 dark:text-red-300");
    expect(source).toContain("dark:bg-amber-950/40 dark:text-amber-300");
  });
});
