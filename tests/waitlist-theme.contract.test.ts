import fs from "node:fs";
import path from "node:path";

describe("waitlist position UX", () => {
  it("keeps waitlist position and errors readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/events/WaitlistPosition.tsx"), "utf8");
    expect(source).toContain("dark:border-amber-900/60 dark:bg-amber-950/30");
    expect(source).toContain("dark:text-amber-300");
    expect(source).toContain('role="alert"');
  });
});
