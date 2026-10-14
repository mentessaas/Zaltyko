import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  benchmarkProfiles,
  auditLog,
  healthScoreVersions,
  locations,
  metricInvalidations,
  organizations,
  outboxEvents,
} from "@/db/zaltyko-schema";
import { assertCurrentCronSystemActor } from "@/lib/cron-system-actor";
import type { SystemActor } from "@/modules/shared/application/actor";
import { calculateAcademyHealthScore } from "@/modules/health-score/application/health-score-service";
import { evaluateP0Insights } from "@/modules/insights/application/evaluate-p0-rules";
import { recomputeMetrics } from "@/modules/analytics/application/metric-engine";
import { buildRetentionCohortProjections } from "@/modules/analytics/application/build-retention-cohort-projections";

export interface MetricInvalidationPipelineResult {
  invalidationId: string;
  metricRunId: string;
  metricsRecomputed: number;
  scoreSnapshotId: string | null;
  scoreSkippedReason:
    | "benchmark_missing"
    | "benchmark_ambiguous"
    | "benchmark_currency_mismatch"
    | "score_version_missing"
    | null;
  insightsEvaluated: number;
  retentionProjectionRuns: number;
  retentionProjectionRows: number;
}

/**
 * Rebuilds one event's analytics from its committed invalidation. This job does
 * not perform business operations, create human insight actions, send notices,
 * or infer a global/synthetic benchmark.
 */
export async function processMetricInvalidation(input: {
  organizationId: string;
  outboxEventId: string;
  actor: SystemActor;
}): Promise<MetricInvalidationPipelineResult | null> {
  assertCurrentCronSystemActor(input.actor);
  const [invalidation] = await db
    .select()
    .from(metricInvalidations)
    .where(
      and(
        eq(metricInvalidations.organizationId, input.organizationId),
        eq(metricInvalidations.outboxEventId, input.outboxEventId)
      )
    )
    .limit(1);
  if (!invalidation) return null;

  const [event] = await db
    .select({ occurredAt: outboxEvents.occurredAt })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, input.organizationId),
        eq(outboxEvents.id, input.outboxEventId)
      )
    )
    .limit(1);
  if (!event) return null;

  const [organization] = await db
    .select({
      status: organizations.status,
      currency: organizations.defaultCurrency,
    })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  if (!organization || !["trial", "active"].includes(organization.status)) {
    return null;
  }

  const activeLocations = await db
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, input.organizationId),
        eq(locations.isActive, true)
      )
    );
  const scopedLocationIds = invalidation.locationId
    ? activeLocations
        .filter((location) => location.id === invalidation.locationId)
        .map((location) => location.id)
    : activeLocations.map((location) => location.id);
  if (scopedLocationIds.length === 0) return null;

  const occurredAt = event.occurredAt.toISOString();
  const actor = input.actor;
  const idempotencyPrefix = `invalidation:${invalidation.id}:${organization.currency}`;
  const metricRun = await recomputeMetrics({
    organizationId: input.organizationId,
    authorizationLocationId: scopedLocationIds[0],
    periodStart: invalidation.affectedFrom,
    periodEnd: invalidation.affectedTo,
    currency: organization.currency,
    sourceWatermark: occurredAt,
    idempotencyKey: `${idempotencyPrefix}:organization`,
    actor,
  });
  const scopedMetricRun = invalidation.locationId
    ? await recomputeMetrics({
        organizationId: input.organizationId,
        authorizationLocationId: invalidation.locationId,
        targetLocationId: invalidation.locationId,
        periodStart: invalidation.affectedFrom,
        periodEnd: invalidation.affectedTo,
        currency: organization.currency,
        sourceWatermark: occurredAt,
        idempotencyKey: `${idempotencyPrefix}:location:${invalidation.locationId}`,
        actor,
      })
    : null;

  let scoreSnapshotId: string | null = null;
  let scoreSkippedReason: MetricInvalidationPipelineResult["scoreSkippedReason"] =
    null;
  if (metricRun.status !== "succeeded") {
    throw new Error(`Metric run did not succeed: ${metricRun.id}`);
  }
  if (scopedMetricRun && scopedMetricRun.status !== "succeeded") {
    throw new Error(
      `Location metric run did not succeed: ${scopedMetricRun.id}`
    );
  }

  const retentionProjection = await buildRetentionCohortProjections({
    organizationId: input.organizationId,
    metricRunId: metricRun.id,
    actor,
  });

  const profiles = await db
    .select({ id: benchmarkProfiles.id, currency: benchmarkProfiles.currency })
    .from(benchmarkProfiles)
    .where(
      and(
        eq(benchmarkProfiles.organizationId, input.organizationId),
        eq(benchmarkProfiles.status, "active")
      )
    )
    .limit(2);
  if (profiles.length === 0) {
    scoreSkippedReason = "benchmark_missing";
  } else if (profiles.length !== 1) {
    scoreSkippedReason = "benchmark_ambiguous";
  } else if (
    profiles[0].currency &&
    profiles[0].currency !== organization.currency
  ) {
    scoreSkippedReason = "benchmark_currency_mismatch";
  } else {
    const [version] = await db
      .select({
        key: healthScoreVersions.key,
        version: healthScoreVersions.version,
      })
      .from(healthScoreVersions)
      .where(
        and(
          eq(healthScoreVersions.key, "zaltyko_owner_health"),
          eq(healthScoreVersions.status, "active")
        )
      )
      .orderBy(desc(healthScoreVersions.version))
      .limit(1);
    if (!version) {
      scoreSkippedReason = "score_version_missing";
    } else {
      const snapshot = await calculateAcademyHealthScore({
        organizationId: input.organizationId,
        metricRunId: metricRun.id,
        benchmarkProfileId: profiles[0].id,
        scoreVersionKey: version.key,
        scoreVersion: version.version,
        idempotencyKey: `score:${metricRun.id}:${profiles[0].id}:${version.version}`,
        actor,
      });
      scoreSnapshotId = snapshot.id;
    }
  }

  if (scoreSkippedReason) {
    await db.transaction(async (tx) => {
      await tx
        .insert(auditLog)
        .values({
          organizationId: input.organizationId,
          locationId: invalidation.locationId,
          actorUserId: null,
          action: "health_score.skipped",
          targetType: "metric_run",
          targetId: metricRun.id,
          idempotencyKey: `score-skip:${invalidation.id}:${scoreSkippedReason}`,
          after: { status: "pending", reason: scoreSkippedReason },
          metadata: {
            actor_type: "system",
            job_key: actor.jobKey,
            correlation_id: actor.correlationId,
          },
        })
        .onConflictDoNothing();
    });
  }

  for (const locationId of scopedLocationIds) {
    await evaluateP0Insights({
      organizationId: input.organizationId,
      locationId,
      actor,
      evaluatedAt: occurredAt,
      sourceWatermark: occurredAt,
      idempotencyPrefix: `outbox:${input.outboxEventId}:${locationId}`,
    });
  }

  return {
    invalidationId: invalidation.id,
    metricRunId: metricRun.id,
    metricsRecomputed: scopedMetricRun ? 2 : 1,
    scoreSnapshotId,
    scoreSkippedReason,
    insightsEvaluated: scopedLocationIds.length,
    retentionProjectionRuns: retentionProjection.projectionRuns,
    retentionProjectionRows: retentionProjection.projectionRows,
  };
}
