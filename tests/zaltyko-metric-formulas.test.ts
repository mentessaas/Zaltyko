import { describe, expect, it } from "vitest";

import {
  cohortRates,
  financialTotals,
  weightedRatio,
} from "@/modules/analytics/domain/metric-formulas";

describe("canonical metric formulas", () => {
  it("weights capacity instead of averaging class percentages", () => {
    expect(
      weightedRatio([
        { numerator: 5, denominator: 10 },
        { numerator: 80, denominator: 100 },
      ])
    ).toEqual({ numerator: 85, denominator: 110, value: 85 / 110 });
  });

  it("is invariant to component ordering", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const components = Array.from({ length: 8 }, (_, index) => ({
        numerator: (seed * (index + 3)) % 17,
        denominator: 20 + ((seed + index * 7) % 31),
      }));
      expect(weightedRatio([...components].reverse())).toEqual(
        weightedRatio(components)
      );
    }
  });

  it("keeps retention and churn complementary for every valid cohort", () => {
    for (let starting = 1; starting <= 200; starting += 1) {
      for (const retained of [0, Math.floor(starting / 2), starting]) {
        const result = cohortRates(starting, retained);
        expect(Number(result.retention) + Number(result.churn)).toBeCloseTo(
          1,
          12
        );
        expect(result.lost).toBe(starting - retained);
      }
    }
  });

  it("preserves the reconciled financial identity", () => {
    for (let expected = 0; expected <= 10_000; expected += 137) {
      const allocated = Math.floor(expected * 0.6);
      const refunded = Math.floor(allocated * 0.2);
      const totals = financialTotals({
        expectedCents: expected,
        allocatedCents: allocated,
        refundedCents: refunded,
      });
      expect(totals.netCollectedCents).toBe(allocated - refunded);
      expect(totals.outstandingCents).toBe(expected - allocated);
    }
  });

  it("rejects impossible cohort and ledger states", () => {
    expect(() => cohortRates(2, 3)).toThrow(RangeError);
    expect(() =>
      financialTotals({
        expectedCents: 100,
        allocatedCents: 101,
        refundedCents: 0,
      })
    ).toThrow(RangeError);
    expect(() =>
      financialTotals({
        expectedCents: 100,
        allocatedCents: 60,
        refundedCents: 61,
      })
    ).toThrow(RangeError);
  });
});
