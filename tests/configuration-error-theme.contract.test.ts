import fs from "node:fs";
import path from "node:path";

describe("configuration error surfaces", () => {
  it.each(["src/app/dashboard/layout.tsx", "src/app/dashboard/profile/page.tsx"])(
    "keeps %s readable in dark mode",
    (file) => {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).toContain("dark:bg-yellow-950/30 dark:border-yellow-900/60");
      expect(source).toContain("dark:text-yellow-300");
      expect(source).toContain("text-muted-foreground");
    }
  );
});
