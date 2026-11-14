import fs from "node:fs";
import path from "node:path";

describe("messages and notifications theme", () => {
  it("keeps the message error banner readable and non-submitting", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/messages/MessagesPage.tsx"), "utf8");
    expect(source).toContain("dark:bg-amber-950/30 dark:text-amber-200");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('type="button"');
  });

});
