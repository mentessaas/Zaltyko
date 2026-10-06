export type ScoreStatus =
  | "critical"
  | "needs_attention"
  | "healthy"
  | "excellent"
  | "insufficient_data";

export interface ScoreContribution {
  score: number | null;
  weight: number;
  coverage: number;
}

export function normalizeMetric(
  actual: number,
  target: number,
  direction: "higher_better" | "lower_better"
): number {
  if (
    !Number.isFinite(actual) ||
    !Number.isFinite(target) ||
    actual < 0 ||
    target <= 0
  ) {
    throw new RangeError("Invalid normalization input");
  }
  const raw =
    direction === "higher_better"
      ? (100 * actual) / target
      : actual <= target
        ? 100
        : (100 * target) / actual;
  return Math.min(100, Math.max(0, raw));
}

export function scoreStatus(score: number | null): ScoreStatus {
  if (score === null) return "insufficient_data";
  if (score < 50) return "critical";
  if (score < 70) return "needs_attention";
  if (score < 85) return "healthy";
  return "excellent";
}

export function aggregateDimension(
  contributions: readonly ScoreContribution[],
  minAvailableWeightRatio: number
): {
  score: number | null;
  coverage: number;
  availableWeight: number;
  configuredWeight: number;
  status: ScoreStatus;
} {
  const configuredWeight = contributions.reduce(
    (sum, item) => sum + item.weight,
    0
  );
  const available = contributions.filter((item) => item.score !== null);
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const effectiveWeight = available.reduce(
    (sum, item) => sum + item.weight * item.coverage,
    0
  );
  const coverage =
    configuredWeight > 0 ? effectiveWeight / configuredWeight : 0;
  const enough =
    configuredWeight > 0 &&
    availableWeight / configuredWeight >= minAvailableWeightRatio;
  const score =
    enough && effectiveWeight > 0
      ? available.reduce(
          (sum, item) => sum + Number(item.score) * item.weight * item.coverage,
          0
        ) / effectiveWeight
      : null;
  return {
    score,
    coverage,
    availableWeight,
    configuredWeight,
    status: scoreStatus(score),
  };
}

export function aggregateAcademyScore(
  dimensions: readonly (ScoreContribution & { valid: boolean })[],
  minValidDimensions: number,
  minGlobalCoverage: number
): {
  score: number | null;
  coverage: number;
  validDimensions: number;
  status: ScoreStatus;
} {
  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  const valid = dimensions.filter((item) => item.valid && item.score !== null);
  const effectiveWeight = valid.reduce(
    (sum, item) => sum + item.weight * item.coverage,
    0
  );
  const coverage = totalWeight > 0 ? effectiveWeight / totalWeight : 0;
  const canPublish =
    valid.length >= minValidDimensions && coverage >= minGlobalCoverage;
  const score =
    canPublish && effectiveWeight > 0
      ? valid.reduce(
          (sum, item) => sum + Number(item.score) * item.weight * item.coverage,
          0
        ) / effectiveWeight
      : null;
  return {
    score,
    coverage,
    validDimensions: valid.length,
    status: scoreStatus(score),
  };
}

export function roundScore(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}
