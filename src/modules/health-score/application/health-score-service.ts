import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  auditLog,
  benchmarkMetricTargets,
  benchmarkProfiles,
  healthScoreDimensionSnapshots,
  healthScoreDimensionWeights,
  healthScoreMetricContributions,
  healthScoreMetricWeights,
  healthScoreSnapshots,
  healthScoreVersions,
  metricRuns,
  metricRunValues,
  type HealthScoreSnapshot,
} from "@/db/zaltyko-schema";
import { evaluationActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  assertOperationalAccess,
  assertSystemOperationalScope,
} from "@/modules/shared/infrastructure/operational-authorization";
import { lockCommand } from "@/modules/shared/infrastructure/transactional-records";
import {
  aggregateAcademyScore,
  aggregateDimension,
  normalizeMetric,
  resolveMetricTarget,
  roundScore,
} from "@/modules/health-score/domain/score-formulas";

const scoreRoles = ["owner", "admin"] as const;
const dimensions = [
  "enrollment",
  "financial",
  "operational",
  "workforce",
] as const;

const calculateHealthScoreSchema = z.object({
  organizationId: z.guid(),
  metricRunId: z.guid(),
  benchmarkProfileId: z.guid(),
  scoreVersionKey: z.string().trim().min(1).default("zaltyko_owner_health"),
  scoreVersion: z.number().int().positive().default(1),
  idempotencyKey: z.string().trim().min(8).max(150),
  actor: evaluationActorSchema,
});

export type CalculateHealthScoreCommand = z.input<
  typeof calculateHealthScoreSchema
>;

export async function calculateAcademyHealthScore(
  command: CalculateHealthScoreCommand
): Promise<HealthScoreSnapshot> {
  const input = calculateHealthScoreSchema.parse(command);

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const [prior] = await tx
      .select()
      .from(healthScoreSnapshots)
      .where(
        and(
          eq(healthScoreSnapshots.organizationId, input.organizationId),
          eq(healthScoreSnapshots.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (prior) {
      const [priorVersion] = await tx
        .select()
        .from(healthScoreVersions)
        .where(eq(healthScoreVersions.id, prior.healthScoreVersionId))
        .limit(1);
      if (
        prior.metricRunId !== input.metricRunId ||
        prior.benchmarkProfileId !== input.benchmarkProfileId ||
        priorVersion?.key !== input.scoreVersionKey ||
        priorVersion?.version !== input.scoreVersion
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave del score ya fue usada con otros parámetros",
          409
        );
      }
      return prior;
    }

    const [run] = await tx
      .select()
      .from(metricRuns)
      .where(
        and(
          eq(metricRuns.organizationId, input.organizationId),
          eq(metricRuns.id, input.metricRunId)
        )
      )
      .limit(1);
    if (!run || run.status !== "succeeded") {
      throw new OperationalError(
        "NOT_FOUND",
        "Ejecución de métricas válida no encontrada",
        404
      );
    }
    const targetLocationId =
      typeof run.parameters.targetLocationId === "string"
        ? run.parameters.targetLocationId
        : null;
    if ("type" in input.actor) {
      await assertSystemOperationalScope(tx, {
        organizationId: input.organizationId,
        locationId: targetLocationId ?? run.authorizationLocationId,
        actor: input.actor,
      });
    } else {
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: targetLocationId ?? run.authorizationLocationId,
        actor: input.actor,
        allowedRoles: scoreRoles,
      });
    }

    const [scoreVersion] = await tx
      .select()
      .from(healthScoreVersions)
      .where(
        and(
          eq(healthScoreVersions.key, input.scoreVersionKey),
          eq(healthScoreVersions.version, input.scoreVersion),
          eq(healthScoreVersions.status, "active")
        )
      )
      .limit(1);
    if (!scoreVersion) {
      throw new OperationalError(
        "NOT_FOUND",
        "Versión activa del score no encontrada",
        404
      );
    }

    const [profile] = await tx
      .select()
      .from(benchmarkProfiles)
      .where(
        and(
          eq(benchmarkProfiles.id, input.benchmarkProfileId),
          eq(benchmarkProfiles.status, "active")
        )
      )
      .limit(1);
    if (
      !profile ||
      (profile.organizationId &&
        profile.organizationId !== input.organizationId)
    ) {
      throw new OperationalError(
        "NOT_FOUND",
        "Perfil benchmark no disponible",
        404
      );
    }

    const dimensionWeights = await tx
      .select()
      .from(healthScoreDimensionWeights)
      .where(
        eq(healthScoreDimensionWeights.healthScoreVersionId, scoreVersion.id)
      )
      .limit(16);
    const metricWeights = await tx
      .select()
      .from(healthScoreMetricWeights)
      .where(eq(healthScoreMetricWeights.healthScoreVersionId, scoreVersion.id))
      .limit(200);
    const targets = await tx
      .select()
      .from(benchmarkMetricTargets)
      .where(eq(benchmarkMetricTargets.benchmarkProfileId, profile.id))
      .limit(200);
    const values = await tx
      .select()
      .from(metricRunValues)
      .where(
        and(
          eq(metricRunValues.organizationId, input.organizationId),
          eq(metricRunValues.metricRunId, run.id)
        )
      )
      .limit(200);

    const valuesByKey = new Map(
      values.map((value) => [value.metricKey, value])
    );
    const targetFor = (metricKey: string, currency: string | null) =>
      resolveMetricTarget(targets, metricKey, currency);

    const dimensionResults = dimensions.map((dimension) => {
      const configured = metricWeights.filter(
        (weight) => weight.dimension === dimension
      );
      const contributions = configured.map((weight) => {
        const value = valuesByKey.get(weight.metricKey);
        const target = targetFor(weight.metricKey, value?.currency ?? null);
        const available = Boolean(
          value &&
          target &&
          value.valueNumeric !== null &&
          value.quality !== "insufficient" &&
          value.quality !== "invalid"
        );
        const normalizedScore = available
          ? normalizeMetric(
              Number(value?.valueNumeric),
              Number(target?.targetNumeric),
              target!.normalizationDirection
            )
          : null;
        return {
          weight,
          value: value ?? null,
          target: target ?? null,
          normalizedScore,
          coverage: available ? Number(value?.coverage ?? 0) : 0,
        };
      });
      const aggregate = aggregateDimension(
        contributions.map((item) => ({
          score: item.normalizedScore,
          weight: Number(item.weight.weight),
          coverage: item.coverage,
        })),
        Number(scoreVersion.minDimensionAvailableWeight)
      );
      return { dimension, contributions, aggregate };
    });

    const global = aggregateAcademyScore(
      dimensionWeights.map((dimensionWeight) => {
        const result = dimensionResults.find(
          (item) => item.dimension === dimensionWeight.dimension
        );
        return {
          score: result?.aggregate.score ?? null,
          weight: Number(dimensionWeight.weight),
          coverage: result?.aggregate.coverage ?? 0,
          valid: result?.aggregate.score !== null,
        };
      }),
      scoreVersion.minValidDimensions,
      Number(scoreVersion.minGlobalCoverage)
    );
    const computedAt = new Date();
    const [snapshot] = await tx
      .insert(healthScoreSnapshots)
      .values({
        organizationId: input.organizationId,
        locationId: targetLocationId,
        metricRunId: run.id,
        healthScoreVersionId: scoreVersion.id,
        benchmarkProfileId: profile.id,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        score: roundScore(global.score),
        status: global.status,
        coverage: global.coverage,
        computedAt,
        sourceWatermark: run.sourceWatermark,
        idempotencyKey: input.idempotencyKey,
        explanation: {
          validDimensions: global.validDimensions,
          requiredDimensions: scoreVersion.minValidDimensions,
          requiredCoverage: Number(scoreVersion.minGlobalCoverage),
          scoreVersion: `${scoreVersion.key}@${scoreVersion.version}`,
          benchmarkProfile: `${profile.key}@${profile.version}`,
          benchmarkSource: {
            title: profile.sourceTitle,
            year: profile.sourceYear,
            page: profile.sourcePage,
          },
        },
      })
      .returning();

    for (const result of dimensionResults) {
      const dimensionScore = roundScore(result.aggregate.score);
      await tx.insert(healthScoreDimensionSnapshots).values({
        organizationId: input.organizationId,
        healthScoreSnapshotId: snapshot.id,
        dimension: result.dimension,
        score: dimensionScore,
        status: result.aggregate.status,
        coverage: result.aggregate.coverage,
        availableMetricWeight: result.aggregate.availableWeight,
        configuredMetricWeight: result.aggregate.configuredWeight,
        explanation: {
          requiredAvailableWeightRatio: Number(
            scoreVersion.minDimensionAvailableWeight
          ),
          availableWeightRatio:
            result.aggregate.configuredWeight > 0
              ? result.aggregate.availableWeight /
                result.aggregate.configuredWeight
              : 0,
        },
      });
      for (const contribution of result.contributions) {
        const metricValue = contribution.value;
        await tx.insert(healthScoreMetricContributions).values({
          organizationId: input.organizationId,
          healthScoreSnapshotId: snapshot.id,
          dimension: result.dimension,
          metricKey: contribution.weight.metricKey,
          metricRunValueId: metricValue?.id,
          benchmarkTargetId: contribution.target?.id,
          actualValue: metricValue?.valueNumeric ?? null,
          targetValue: contribution.target?.targetNumeric ?? null,
          normalizedScore: roundScore(contribution.normalizedScore),
          metricWeight: Number(contribution.weight.weight),
          metricCoverage: contribution.coverage,
          effectiveWeight:
            Number(contribution.weight.weight) * contribution.coverage,
          quality: metricValue?.quality ?? "insufficient",
          formulaVersion: metricValue?.formulaVersion,
          explanation: {
            numerator: metricValue?.numerator ?? null,
            denominator: metricValue?.denominator ?? null,
            sourceWatermark: metricValue?.sourceWatermark.toISOString() ?? null,
            normalizationDirection:
              contribution.target?.normalizationDirection ?? null,
            targetNotes: contribution.target?.notes ?? null,
            diagnostics: metricValue?.diagnostics ?? {},
          },
        });
      }
    }

    await tx.insert(auditLog).values({
      organizationId: input.organizationId,
      locationId: targetLocationId,
      actorUserId: "type" in input.actor ? null : input.actor.userId,
      action: "health_score.computed",
      targetType: "health_score_snapshot",
      targetId: snapshot.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        score: snapshot.score,
        status: snapshot.status,
        coverage: snapshot.coverage,
        metricRunId: run.id,
        scoreVersion: `${scoreVersion.key}@${scoreVersion.version}`,
        benchmarkProfile: `${profile.key}@${profile.version}`,
      },
      metadata:
        "type" in input.actor
          ? {
              actor_type: "system",
              job_key: input.actor.jobKey,
              correlation_id: input.actor.correlationId,
            }
          : { actor_type: "user" },
    });
    return snapshot;
  });
}
