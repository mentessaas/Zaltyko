import fs from "node:fs";
import path from "node:path";

describe("messages and notifications theme", () => {
  it("keeps the message error banner readable and non-submitting", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/messages/MessagesPage.tsx"), "utf8");
    expect(source).toContain("dark:bg-amber-950/30 dark:text-amber-200");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('type="button"');
  });

  it("keeps notification type badges readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/app/[academyId]/notifications/page.tsx"), "utf8");
    expect(source).toContain("dark:bg-blue-950/40 dark:text-blue-300");
    expect(source).toContain("dark:bg-yellow-950/40 dark:text-yellow-300");
  });
});
