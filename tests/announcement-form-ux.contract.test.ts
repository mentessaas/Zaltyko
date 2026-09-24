import fs from "node:fs";
import path from "node:path";

describe("announcement form UX", () => {
  it("announces errors and priority guidance with dark-mode contrast", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/announcements/AnnouncementForm.tsx"), "utf8");
    expect(source).toContain('role="alert" aria-live="assertive"');
    expect(source).toContain('role="status"');
    expect(source).toContain("dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300");
  });
});
