import { describe, expect, it } from "vitest";

import { calculateGroupSimulation } from "@/modules/insights/domain/group-simulation";

describe("simulación hipotética de nuevo grupo", () => {
  it("limita plazas vendibles a la demanda y aplica escenarios explícitos", () => {
    expect(
      calculateGroupSimulation({ eligibleDemand: 7, proposedCapacity: 4 })
    ).toEqual([
      {
        key: "low",
        label: "Bajo",
        conversionRate: 0.5,
        estimatedEnrollments: 2,
        grossMonthlyMinor: null,
      },
      {
        key: "base",
        label: "Central",
        conversionRate: 0.75,
        estimatedEnrollments: 3,
        grossMonthlyMinor: null,
      },
      {
        key: "high",
        label: "Alto",
        conversionRate: 1,
        estimatedEnrollments: 4,
        grossMonthlyMinor: null,
      },
    ]);
  });

  it("solo calcula importe bruto si el usuario aporta un precio hipotético", () => {
    const [low, base, high] = calculateGroupSimulation({
      eligibleDemand: 5,
      proposedCapacity: 8,
      monthlyPriceMinor: 6250,
    });
    expect([low.estimatedEnrollments, base.estimatedEnrollments, high.estimatedEnrollments]).toEqual([2, 3, 5]);
    expect([low.grossMonthlyMinor, base.grossMonthlyMinor, high.grossMonthlyMinor]).toEqual([12500, 18750, 31250]);
  });

  it("rechaza capacidad y cantidades fuera de rango", () => {
    expect(() => calculateGroupSimulation({ eligibleDemand: 3, proposedCapacity: 0 })).toThrow(RangeError);
    expect(() => calculateGroupSimulation({ eligibleDemand: 3, proposedCapacity: 101 })).toThrow(RangeError);
    expect(() => calculateGroupSimulation({ eligibleDemand: -1, proposedCapacity: 4 })).toThrow(RangeError);
    expect(() => calculateGroupSimulation({ eligibleDemand: 3, proposedCapacity: 4, monthlyPriceMinor: -1 })).toThrow(RangeError);
  });
});
