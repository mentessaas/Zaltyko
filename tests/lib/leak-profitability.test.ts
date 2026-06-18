import { describe, expect, it } from "vitest";

import { calculateClassProfitability, calculateDiagnosticResult } from "@/lib/reports/leak-profitability";

describe("leak profitability reports", () => {
  it("calculates diagnostic maturity and recommended tasks", () => {
    const result = calculateDiagnosticResult({
      paymentsConfigured: true,
      attendanceTracked: true,
      groupsHaveCapacity: true,
      costsConfigured: false,
      evaluationsRecent: false,
    });

    expect(result.score).toBe(30);
    expect(result.level).toBe("supervivencia");
    expect(result.recommendedTasks).toContain("Añadir costes de entrenadores y gastos operativos");
  });

  it("calculates occupancy, estimated costs and margin alerts", () => {
    const result = calculateClassProfitability({
      classId: "class-1",
      className: "Grupo Base",
      capacity: 10,
      enrolledCount: 6,
      waitlistCount: 0,
      expectedRevenueCents: 30000,
      collectedRevenueCents: 20000,
      coachCostCents: 18000,
      allocatedExpenseCents: 15000,
      missingCostData: false,
    });

    expect(result.occupancyRate).toBe(0.6);
    expect(result.estimatedCostCents).toBe(33000);
    expect(result.estimatedMarginCents).toBe(-3000);
    expect(result.alerts).toContain("Plazas libres relevantes");
    expect(result.alerts).toContain("Margen estimado negativo");
    expect(result.isEstimated).toBe(true);
  });
});

