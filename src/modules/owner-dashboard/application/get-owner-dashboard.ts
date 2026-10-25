import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  benchmarkProfiles,
  healthScoreDimensionSnapshots,
  healthScoreMetricContributions,
  healthScoreSnapshots,
  insightRuleVersions,
  insights,
  metricDefinitions,
  metricRunValues,
} from "@/db/zaltyko-schema";
import {
  getPipelineFreshness,
  type PipelineFreshness,
} from "@/modules/analytics/application/pipeline-freshness";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

export type DashboardDataState = "ready" | "empty" | "stale" | "insufficient";

export const ownerDashboardQuerySchema = z
  .object({
    organizationId: z.guid().optional(),
    locationId: z.guid().optional(),
    programId: z.guid().optional(),
    groupId: z.guid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((value) => Boolean(value.from) === Boolean(value.to), {
    message: "from y to deben enviarse juntos",
    path: ["from"],
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "El período es inválido",
    path: ["to"],
  });

export type OwnerDashboardQuery = z.infer<typeof ownerDashboardQuerySchema>;

export interface OwnerDashboardBundle {
  state: DashboardDataState;
  organization: { id: string; name: string };
  scope: {
    locationId: string | null;
    locations: { id: string; name: string }[];
    canViewOrganizationAggregate: boolean;
    canManageHealthScore: boolean;
  };
  period: { start: string; end: string } | null;
  availablePeriods: Array<{ start: string; end: string }>;
  score: {
    id: string;
    value: number | null;
    status: string;
    coverage: number;
    computedAt: string;
    sourceWatermark: string;
    benchmarkName: string;
    benchmarkSource: string;
    explanation: Record<string, unknown>;
  } | null;
  scoreComparison: {
    previousPeriod: { start: string; end: string };
    delta: number;
  } | null;
  dimensions: Array<{
    key: string;
    label: string;
    score: number | null;
    status: string;
    coverage: number;
    availableMetricWeight: number;
    configuredMetricWeight: number;
  }>;
  metrics: Array<{
    key: string;
    name: string;
    unit: string;
    value: number | null;
    currency: string | null;
    numerator: number | null;
    denominator: number | null;
    coverage: number;
    quality: string;
    formulaVersion: number;
    normalizedScore: number | null;
    target: number | null;
    weight: number | null;
    sourceWatermark: string;
  }>;
  priorities: Array<{
    key: string;
    tone: "warning" | "neutral";
    title: string;
    detail: string;
    href: string;
  }>;
  scoreTrend: Array<{
    periodEnd: string;
    score: number | null;
    status: string;
  }>;
  freshness: PipelineFreshness;
}

const dimensionLabels: Record<string, string> = {
  enrollment: "Inscripciones",
  financial: "Cobros",
  operational: "Operaciones",
  workforce: "Equipo",
};

const dimensionOrder: Record<string, number> = {
  enrollment: 0,
  financial: 1,
  operational: 2,
  workforce: 3,
};

export async function getOwnerDashboard(
  input: OwnerDashboardQuery & { userId: string }
): Promise<OwnerDashboardBundle> {
  const scope = await resolveOwnerScope(input);
  const organizationId = scope.organization.id;
  const selectedLocationId = scope.selectedLocationId;
  const freshness = await getPipelineFreshness({
    organizationId,
    locationId: selectedLocationId,
  });

  const locationCondition = selectedLocationId
    ? eq(healthScoreSnapshots.locationId, selectedLocationId)
    : isNull(healthScoreSnapshots.locationId);
  const snapshotRows = await db
    .select({
      snapshot: healthScoreSnapshots,
      benchmarkName: benchmarkProfiles.name,
      benchmarkSource: benchmarkProfiles.sourceTitle,
    })
    .from(healthScoreSnapshots)
    .innerJoin(
      benchmarkProfiles,
      eq(benchmarkProfiles.id, healthScoreSnapshots.benchmarkProfileId)
    )
    .where(
      and(
        eq(healthScoreSnapshots.organizationId, organizationId),
        locationCondition
      )
    )
    .orderBy(
      desc(healthScoreSnapshots.periodEnd),
      desc(healthScoreSnapshots.computedAt)
    )
    .limit(12);
  const latest = input.from
    ? snapshotRows.find(
        (row) =>
          row.snapshot.periodStart === input.from &&
          row.snapshot.periodEnd === input.to
      )
    : snapshotRows[0];
  const scoreComparison =
    latest?.snapshot.score === null || !latest
      ? null
      : (() => {
          const currentDays =
            (Date.parse(`${latest.snapshot.periodEnd}T00:00:00Z`) -
              Date.parse(`${latest.snapshot.periodStart}T00:00:00Z`)) /
            86_400_000 +
            1;
          const maximumDurationDriftDays = currentDays >= 28 ? 3 : 1;
          const previous = snapshotRows.find((row) => {
            const days =
              (Date.parse(`${row.snapshot.periodEnd}T00:00:00Z`) -
                Date.parse(`${row.snapshot.periodStart}T00:00:00Z`)) /
                86_400_000 +
              1;
            return (
              row.snapshot.periodEnd < latest.snapshot.periodStart &&
              row.snapshot.benchmarkProfileId ===
                latest.snapshot.benchmarkProfileId &&
              row.snapshot.score !== null &&
              row.snapshot.status !== "insufficient_data" &&
              Math.abs(days - currentDays) <= maximumDurationDriftDays
            );
          });
          return previous
            ? {
                previousPeriod: {
                  start: previous.snapshot.periodStart,
                  end: previous.snapshot.periodEnd,
                },
                delta:
                  Number(latest.snapshot.score) -
                  Number(previous.snapshot.score),
              }
            : null;
        })();
  const availablePeriods = Array.from(
    new Map(
      snapshotRows.map((row) => [
        `${row.snapshot.periodStart}:${row.snapshot.periodEnd}`,
        { start: row.snapshot.periodStart, end: row.snapshot.periodEnd },
      ])
    ).values()
  );
  const insightLocationCondition = selectedLocationId
    ? eq(insights.locationId, selectedLocationId)
    : undefined;
  const insightRows = await db
    .select({
      id: insights.id,
      severity: insights.severity,
      title: insights.title,
      detail: insights.detail,
      ruleName: insightRuleVersions.name,
    })
    .from(insights)
    .innerJoin(
      insightRuleVersions,
      eq(insightRuleVersions.id, insights.ruleVersionId)
    )
    .where(
      and(
        eq(insights.organizationId, organizationId),
        inArray(insights.status, ["open", "viewed"]),
        insightLocationCondition
      )
    )
    .orderBy(desc(insights.priorityScore), desc(insights.lastSeenAt))
    .limit(3);
  const insightPriorities: OwnerDashboardBundle["priorities"] = insightRows.map(
    (insight) => ({
      key: `insight-${insight.id}`,
      tone: insight.severity === "info" ? "neutral" : "warning",
      title: insight.title || insight.ruleName,
      detail: insight.detail,
      href: `/owner/insights?organizationId=${organizationId}#insight-${insight.id}`,
    })
  );
  if (!latest) {
    const [internalTargetProfile] = await db
      .select({ id: benchmarkProfiles.id })
      .from(benchmarkProfiles)
      .where(
        and(
          eq(benchmarkProfiles.organizationId, organizationId),
          eq(benchmarkProfiles.key, "academy_internal_targets"),
          eq(benchmarkProfiles.status, "active")
        )
      )
      .limit(1);
    const emptyPriorities = [...insightPriorities];
    const canManageHealthScore = ["owner", "admin"].includes(scope.member.role);
    if (!internalTargetProfile && canManageHealthScore) {
      emptyPriorities.unshift({
        key: "score-targets-setup",
        tone: "neutral",
        title: "Configura metas propias para activar el Health Score",
        detail:
          "Son objetivos de tu academia, no promedios del sector ni una comparación con otras academias.",
        href: `/owner/health-score/setup?organizationId=${organizationId}`,
      });
    }
    return {
      state: "empty",
      organization: {
        id: scope.organization.id,
        name: scope.organization.name,
      },
      scope: {
        locationId: selectedLocationId,
        locations: scope.locations,
        canViewOrganizationAggregate: scope.canViewOrganizationAggregate,
        canManageHealthScore,
      },
      period: null,
      availablePeriods,
      score: null,
      scoreComparison: null,
      dimensions: [],
      metrics: [],
      priorities:
        emptyPriorities.length > 0
          ? emptyPriorities.slice(0, 3)
          : [
              {
                key: "first-calculation",
                tone: "neutral",
                title: "Todavía no hay un cierre calculado",
                detail:
                  "Completa los datos operativos y ejecuta la primera recomputación.",
                href: "/owner#data-status",
              },
            ],
      scoreTrend: [],
      freshness,
    };
  }

  const dimensionRows = await db
    .select()
    .from(healthScoreDimensionSnapshots)
    .where(
      and(
        eq(healthScoreDimensionSnapshots.organizationId, organizationId),
        eq(
          healthScoreDimensionSnapshots.healthScoreSnapshotId,
          latest.snapshot.id
        )
      )
    )
    .limit(4);
  const contributionRows = await db
    .select()
    .from(healthScoreMetricContributions)
    .where(
      and(
        eq(healthScoreMetricContributions.organizationId, organizationId),
        eq(
          healthScoreMetricContributions.healthScoreSnapshotId,
          latest.snapshot.id
        )
      )
    )
    .limit(100);
  const runValues = await db
    .select()
    .from(metricRunValues)
    .where(
      and(
        eq(metricRunValues.organizationId, organizationId),
        eq(metricRunValues.metricRunId, latest.snapshot.metricRunId)
      )
    )
    .limit(200);
  const definitions = await db.select().from(metricDefinitions).limit(200);
  const definitionByKey = new Map(definitions.map((item) => [item.key, item]));
  const contributionByKey = new Map(
    contributionRows.map((item) => [item.metricKey, item])
  );

  const metrics = runValues.map((value) => {
    const definition = definitionByKey.get(value.metricKey);
    const contribution = contributionByKey.get(value.metricKey);
    return {
      key: value.metricKey,
      name: definition?.name ?? value.metricKey,
      unit: definition?.unit ?? "count",
      value: value.valueNumeric === null ? null : Number(value.valueNumeric),
      currency: value.currency,
      numerator: value.numerator === null ? null : Number(value.numerator),
      denominator:
        value.denominator === null ? null : Number(value.denominator),
      coverage: Number(value.coverage),
      quality: value.quality,
      formulaVersion: value.formulaVersion,
      normalizedScore:
        contribution?.normalizedScore === null ||
        contribution?.normalizedScore === undefined
          ? null
          : Number(contribution.normalizedScore),
      target:
        contribution?.targetValue === null ||
        contribution?.targetValue === undefined
          ? null
          : Number(contribution.targetValue),
      weight:
        contribution?.metricWeight === undefined
          ? null
          : Number(contribution.metricWeight),
      sourceWatermark: value.sourceWatermark.toISOString(),
    };
  });
  const dimensionsBundle = dimensionRows
    .map((dimension) => ({
      key: dimension.dimension,
      label: dimensionLabels[dimension.dimension] ?? dimension.dimension,
      score: dimension.score === null ? null : Number(dimension.score),
      status: dimension.status,
      coverage: Number(dimension.coverage),
      availableMetricWeight: Number(dimension.availableMetricWeight),
      configuredMetricWeight: Number(dimension.configuredMetricWeight),
    }))
    .sort(
      (a, b) =>
        (dimensionOrder[a.key] ?? Number.MAX_SAFE_INTEGER) -
        (dimensionOrder[b.key] ?? Number.MAX_SAFE_INTEGER)
    );
  const priorities: OwnerDashboardBundle["priorities"] = [...insightPriorities];
  for (const dimension of dimensionsBundle) {
    if (priorities.length >= 3) break;
    if (dimension.status === "insufficient_data") {
      priorities.push({
        key: `dimension-${dimension.key}`,
        tone: "neutral",
        title: `Completar datos de ${dimension.label.toLowerCase()}`,
        detail: `Cobertura ${(dimension.coverage * 100).toFixed(0)}%. No se convierte la ausencia de datos en un cero.`,
        href: `#dimension-${dimension.key}`,
      });
    }
  }
  for (const contribution of contributionRows
    .filter(
      (item) =>
        item.normalizedScore !== null && Number(item.normalizedScore) < 70
    )
    .sort((a, b) => Number(a.normalizedScore) - Number(b.normalizedScore))
    .slice(0, 2)) {
    if (priorities.length >= 3) break;
    priorities.push({
      key: `metric-${contribution.metricKey}`,
      tone: "warning",
      title:
        definitionByKey.get(contribution.metricKey)?.name ??
        contribution.metricKey,
      detail: `Índice ${Number(contribution.normalizedScore).toFixed(0)}/100 frente al objetivo del perfil.`,
      href: `#metric-${contribution.metricKey}`,
    });
  }
  const hasStale = metrics.some((metric) => metric.quality === "stale");
  const state: DashboardDataState =
    hasStale ||
    freshness.status === "stale" ||
    freshness.status === "failed"
    ? "stale"
    : latest.snapshot.status === "insufficient_data"
      ? "insufficient"
      : "ready";

  return {
    state,
    organization: {
      id: scope.organization.id,
      name: scope.organization.name,
    },
    scope: {
      locationId: selectedLocationId,
      locations: scope.locations,
      canViewOrganizationAggregate: scope.canViewOrganizationAggregate,
      canManageHealthScore: ["owner", "admin"].includes(scope.member.role),
    },
    period: {
      start: latest.snapshot.periodStart,
      end: latest.snapshot.periodEnd,
    },
    availablePeriods,
    score: {
      id: latest.snapshot.id,
      value:
        latest.snapshot.score === null ? null : Number(latest.snapshot.score),
      status: latest.snapshot.status,
      coverage: Number(latest.snapshot.coverage),
      computedAt: latest.snapshot.computedAt.toISOString(),
      sourceWatermark: latest.snapshot.sourceWatermark.toISOString(),
      benchmarkName: latest.benchmarkName,
      benchmarkSource: latest.benchmarkSource,
      explanation: latest.snapshot.explanation,
    },
    scoreComparison,
    dimensions: dimensionsBundle,
    metrics,
    priorities: priorities.slice(0, 3),
    scoreTrend: snapshotRows
      .filter(
        (row, index, rows) =>
          rows.findIndex(
            (candidate) =>
              candidate.snapshot.periodEnd === row.snapshot.periodEnd
          ) === index
      )
      .slice(0, 6)
      .map((row) => ({
        periodEnd: row.snapshot.periodEnd,
        score: row.snapshot.score === null ? null : Number(row.snapshot.score),
        status: row.snapshot.status,
      }))
      .reverse(),
    freshness,
  };
}
