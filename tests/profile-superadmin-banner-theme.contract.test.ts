import fs from "node:fs";
import path from "node:path";

describe("super-admin profile banners", () => {
  it.each(["ParentProfile.tsx", "CoachProfile.tsx", "AthleteProfile.tsx"])(
    "keeps %s readable in dark mode",
    (file) => {
      const source = fs.readFileSync(path.join(process.cwd(), "src/components/profiles", file), "utf8");
      expect(source).toContain("dark:text-amber-200");
      expect(source).toContain("dark:text-amber-300");
      expect(source).toContain("dark:hover:bg-amber-950/40");
    }
  );
});
