export interface RatioComponent {
  numerator: number;
  denominator: number;
}

export function weightedRatio(components: readonly RatioComponent[]): {
  numerator: number;
  denominator: number;
  value: number | null;
} {
  const numerator = components.reduce((sum, item) => sum + item.numerator, 0);
  const denominator = components.reduce(
    (sum, item) => sum + item.denominator,
    0
  );
  if (components.some((item) => item.numerator < 0 || item.denominator < 0)) {
    throw new RangeError("Metric components cannot be negative");
  }
  return {
    numerator,
    denominator,
    value: denominator > 0 ? numerator / denominator : null,
  };
}

export function cohortRates(
  starting: number,
  retained: number
): {
  retention: number | null;
  churn: number | null;
  lost: number;
} {
  if (starting < 0 || retained < 0 || retained > starting) {
    throw new RangeError("Invalid cohort counts");
  }
  const lost = starting - retained;
  return {
    retention: starting > 0 ? retained / starting : null,
    churn: starting > 0 ? lost / starting : null,
    lost,
  };
}

export function financialTotals(input: {
  expectedCents: number;
  allocatedCents: number;
  refundedCents: number;
}): { netCollectedCents: number; outstandingCents: number } {
  if (
    input.expectedCents < 0 ||
    input.allocatedCents < 0 ||
    input.refundedCents < 0 ||
    input.allocatedCents > input.expectedCents ||
    input.refundedCents > input.allocatedCents
  ) {
    throw new RangeError("Invalid financial metric totals");
  }
  return {
    netCollectedCents: input.allocatedCents - input.refundedCents,
    outstandingCents: input.expectedCents - input.allocatedCents,
  };
}
