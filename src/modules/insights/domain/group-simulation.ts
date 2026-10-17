export const GROUP_CONVERSION_SCENARIOS = [
  { key: "low", label: "Bajo", conversionRate: 0.5 },
  { key: "base", label: "Central", conversionRate: 0.75 },
  { key: "high", label: "Alto", conversionRate: 1 },
] as const;

export interface GroupSimulationScenario {
  key: (typeof GROUP_CONVERSION_SCENARIOS)[number]["key"];
  label: string;
  conversionRate: number;
  estimatedEnrollments: number;
  grossMonthlyMinor: number | null;
}

export function calculateGroupSimulation(input: {
  eligibleDemand: number;
  proposedCapacity: number;
  monthlyPriceMinor?: number;
}): GroupSimulationScenario[] {
  if (
    !Number.isInteger(input.eligibleDemand) ||
    input.eligibleDemand < 0 ||
    !Number.isInteger(input.proposedCapacity) ||
    input.proposedCapacity < 1 ||
    input.proposedCapacity > 100 ||
    (input.monthlyPriceMinor !== undefined &&
      (!Number.isInteger(input.monthlyPriceMinor) || input.monthlyPriceMinor < 0))
  ) {
    throw new RangeError("Parámetros de simulación fuera de rango");
  }

  const sellableSeats = Math.min(input.eligibleDemand, input.proposedCapacity);
  return GROUP_CONVERSION_SCENARIOS.map((scenario) => {
    const estimatedEnrollments = Math.floor(
      sellableSeats * scenario.conversionRate
    );
    return {
      ...scenario,
      estimatedEnrollments,
      grossMonthlyMinor:
        input.monthlyPriceMinor === undefined
          ? null
          : estimatedEnrollments * input.monthlyPriceMinor,
    };
  });
}
