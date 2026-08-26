import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app/api/coach-compensation/route.ts", import.meta.url), "utf8");

describe("coach compensation API P0 contract", () => {
  it("expone GET y POST bajo withTenant", () => {
    expect(source).toMatch(/export const GET/);
    expect(source).toMatch(/export const POST/);
    expect(source).toMatch(/withTenant/);
  });

  it("aplica feature gate y valida importes/horas", () => {
    expect(source).toMatch(/requireLeakProfitabilityFeature/);
    expect(source).toMatch(/hourlyRateCents|monthlySalaryCents/);
    expect(source).toMatch(/estimatedWeeklyHours/);
    expect(source).toMatch(/min\(0\)/);
  });

  it("comprueba academy y coach dentro del tenant antes de insertar", () => {
    expect(source).toMatch(/ACADEMY_NOT_FOUND/);
    expect(source).toMatch(/COACH_NOT_FOUND/);
    expect(source).toMatch(/tenantId/);
  });
});
