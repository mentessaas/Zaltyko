import { describe, expect, it } from "vitest";

import {
  calculateInsightPriority,
  evaluateExcessDemand,
} from "@/modules/insights/domain/insight-rules";

describe("insight rules", () => {
  it("aplica exactamente la fórmula de prioridad del PRD", () => {
    expect(
      calculateInsightPriority({
        impactScore: 80,
        urgencyScore: 60,
        confidenceScore: 90,
        actionabilityScore: 100,
      })
    ).toBe(80);
  });

  it("no crea demanda excedente por debajo de los umbrales", () => {
    expect(
      evaluateExcessDemand({
        classTemplateId: "30000000-0000-0000-0000-000000000801",
        fillRate: 0.89,
        eligibleWaitlist: 3,
        observedSessions: 4,
      })
    ).toBeNull();
  });

  it("explica el rango sin prometer ingreso", () => {
    const candidate = evaluateExcessDemand({
      classTemplateId: "30000000-0000-0000-0000-000000000801",
      fillRate: 0.92,
      eligibleWaitlist: 3,
      observedSessions: 4,
      monthlyPriceMinor: 6000,
      currency: "EUR",
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.estimatedValueMinMinor).toBe(9000);
    expect(candidate?.estimatedValueMaxMinor).toBe(18000);
    expect(candidate?.assumptions.join(" ")).toContain("no garantiza");
    expect(candidate?.ctaKey).toBe("simulate_group");
  });
});
