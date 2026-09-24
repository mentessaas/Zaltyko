import fs from "node:fs";
import path from "node:path";

describe("athlete stats error state", () => {
  it("offers a visible retry action with dark-mode contrast", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/athletes/AthleteStatsOverview.tsx"), "utf8");
    expect(source).toContain('role="alert"');
    expect(source).toContain("dark:bg-red-950/30");
    expect(source).toContain("setRetryCount((count) => count + 1)");
    expect(source).toContain("Reintentar");
  });
});
