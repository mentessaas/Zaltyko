import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const revenueSource = readFileSync("src/components/dashboard/RevenueTrendChart.tsx", "utf8");
const retentionSource = readFileSync("src/components/dashboard/AthleteRetentionWidget.tsx", "utf8");
const sectionSource = readFileSync("src/components/dashboard/FinancialSection.tsx", "utf8");

describe("dashboard financial truth", () => {
  it("no presenta series de ejemplo hardcodeadas", () => {
    expect(revenueSource).toContain("/revenue-trend");
    expect(revenueSource).toContain("Aún no hay ingresos registrados");
    expect(revenueSource).toContain("hasRevenue");
    expect(revenueSource).not.toContain("MONTHLY_DATA");
    expect(revenueSource).not.toContain("+8.2%");

    expect(retentionSource).toContain("/retention");
    expect(retentionSource).toContain("Aún no hay datos de retención");
    expect(retentionSource).toContain("hasRetentionActivity");
    expect(retentionSource).not.toContain("const DATA");
  });

  it("carga el detalle financiero solo cuando el dueño lo abre", () => {
    expect(sectionSource).toContain('dynamic(');
    expect(sectionSource).toContain('import("./FinancialDetails")');
    expect(sectionSource).toContain("showFinancials && (");
    expect(sectionSource).toContain("<FinancialDetails academyId={academyId} />");
    expect(sectionSource).toContain("aria-expanded={showFinancials}");
    expect(sectionSource).toContain("aria-controls={`financial-details-${academyId}`}");
  });
});
