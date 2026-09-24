import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("financial report child routes contract", () => {
  it("exposes the monthly, delinquency and projections endpoints used by the product", () => {
    const handler = readFileSync("src/lib/reports/financial-report-handler.ts", "utf8");
    const component = readFileSync("src/components/reports/FinancialReport.tsx", "utf8");

    expect(handler).toContain('"monthly"');
    expect(handler).toContain('"delinquency"');
    expect(handler).toContain('"projections"');
    expect(component).toContain("/api/reports/financial/monthly");
    expect(component).toContain("/api/reports/financial/delinquency");
  });

  it("keeps all financial report variants behind the tenant wrapper", () => {
    for (const route of [
      "src/app/api/reports/financial/route.ts",
      "src/app/api/reports/financial/monthly/route.ts",
      "src/app/api/reports/financial/delinquency/route.ts",
      "src/app/api/reports/financial/projections/route.ts",
    ]) {
      expect(readFileSync(route, "utf8")).toContain("withFinancialReport");
      expect(readFileSync(route, "utf8")).toContain("@route-auth tenant");
    }

    const handler = readFileSync("src/lib/reports/financial-report-handler.ts", "utf8");
    expect(handler).toContain("return withTenant");
    expect(handler).toContain("apiSuccess");
  });
});
