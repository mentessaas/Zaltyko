import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("API envelopes consumed by dashboards and reports", () => {
  it("returns one data envelope for clients that read response.data", () => {
    const routes = [
      "src/app/api/reports/churn/route.ts",
      "src/app/api/reports/class/route.ts",
      "src/app/api/dashboard/[academyId]/analytics/route.ts",
      "src/app/api/dashboard/[academyId]/analytics/full/route.ts",
    ].map((path) => readFileSync(path, "utf8"));

    for (const source of routes) {
      expect(source).not.toMatch(/apiSuccess\(\{\s*data\s*:/);
    }
  });
});
