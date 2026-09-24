import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public directory filter validation", () => {
  it("validates date filters before SQL date casts", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/public/events/route.ts"), "utf8");
    expect(route).toContain("startDate: z.string().date().optional()");
    expect(route).toContain("endDate: z.string().date().optional()");
  });

  it("bounds free-text academy filters", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/public/academies/route.ts"), "utf8");
    expect(route).toContain("search: z.string().trim().max(120).optional()");
    expect(route).toContain("country: z.string().trim().max(120).optional()");
  });
});
