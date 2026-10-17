import { describe, expect, it } from "vitest";

import {
  aggregateAcademyScore,
  aggregateDimension,
  normalizeMetric,
  scoreStatus,
} from "@/modules/health-score/domain/score-formulas";

describe("Academy Health Score formulas", () => {
  it("normalizes higher/lower targets and clamps to 100", () => {
    expect(normalizeMetric(0.5, 0.8, "higher_better")).toBe(62.5);
    expect(normalizeMetric(0.9, 0.8, "higher_better")).toBe(100);
    expect(normalizeMetric(0.04, 0.05, "lower_better")).toBe(100);
    expect(normalizeMetric(0.1, 0.05, "lower_better")).toBe(50);
  });

  it("marks Enrollment insufficient when missing fill removes over 40%", () => {
    const result = aggregateDimension(
      [
        { score: null, weight: 0.45, coverage: 0 },
        { score: 90, weight: 0.35, coverage: 1 },
        { score: 100, weight: 0.2, coverage: 1 },
      ],
      0.6
    );
    expect(result.availableWeight).toBeCloseTo(0.55);
    expect(result.score).toBeNull();
    expect(result.status).toBe("insufficient_data");
  });

  it("requires three dimensions and at least 70% global coverage", () => {
    const valid = aggregateAcademyScore(
      [
        { score: 80, weight: 0.3, coverage: 1, valid: true },
        { score: 70, weight: 0.3, coverage: 1, valid: true },
        { score: 90, weight: 0.25, coverage: 1, valid: true },
        { score: null, weight: 0.15, coverage: 0, valid: false },
      ],
      3,
      0.7
    );
    expect(valid.coverage).toBeCloseTo(0.85);
    expect(valid.score).not.toBeNull();

    const insufficient = aggregateAcademyScore(
      [
        { score: 80, weight: 0.3, coverage: 1, valid: true },
        { score: 70, weight: 0.3, coverage: 1, valid: true },
        { score: null, weight: 0.25, coverage: 0, valid: false },
        { score: null, weight: 0.15, coverage: 0, valid: false },
      ],
      3,
      0.7
    );
    expect(insufficient.score).toBeNull();
    expect(insufficient.status).toBe("insufficient_data");
  });

  it("uses the declared presentation bands", () => {
    expect(scoreStatus(49.99)).toBe("critical");
    expect(scoreStatus(50)).toBe("needs_attention");
    expect(scoreStatus(70)).toBe("healthy");
    expect(scoreStatus(85)).toBe("excellent");
  });
});
