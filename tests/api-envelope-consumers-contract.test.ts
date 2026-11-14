import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("API envelopes consumed by dashboards and reports", () => {
  it("returns one data envelope for clients that read response.data", () => {
    const routes = [
      "src/app/api/dashboard/[academyId]/analytics/route.ts",
    ].map((path) => readFileSync(path, "utf8"));

    for (const source of routes) {
      expect(source).not.toMatch(/apiSuccess\(\{\s*data\s*:/);
    }
  });
});
