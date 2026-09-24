import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const emailRoutes = ["class", "coach", "churn", "progress"] as const;

describe("report email side-effect contract", () => {
  it("uses POST JSON for every report email route", () => {
    for (const report of emailRoutes) {
      const source = readFileSync(
        join(process.cwd(), `src/app/api/reports/${report}/email/route.ts`),
        "utf8",
      );
      expect(source).toContain("export const POST");
      expect(source).toContain("await request.json()");
      expect(source).not.toContain("export const GET");
    }
  });

  it("does not put report recipients in a query-string fetch", () => {
    for (const report of emailRoutes) {
      const source = readFileSync(
        join(process.cwd(), `src/components/reports/${report === "class" ? "ClassReport" : report === "coach" ? "CoachReport" : report === "churn" ? "ChurnReport" : "ProgressReport"}.tsx`),
        "utf8",
      );
      expect(source).toContain('method: "POST"');
      expect(source).toContain('headers: { "Content-Type": "application/json" }');
      expect(source).toContain("JSON.stringify");
    }
  });
});
