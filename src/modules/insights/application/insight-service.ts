import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  auditLog,
  insightActions,
  insightNotifications,
  insightRuleRuns,
  insightRuleVersions,
  insightRunObservations,
  insights,
  insightStatusHistory,
  locations,
  organizations,
  type Insight,
  type InsightAction,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { calculateInsightPriority } from "@/modules/insights/domain/insight-rules";
import { calculateGroupSimulation } from "@/modules/insights/domain/group-simulation";
import {
  evaluationActorSchema,
  operationalActorSchema,
  type EvaluationActor,
  type SystemActor,
} from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  assertOperationalAccess,
  assertSystemOperationalScope,
} from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";
import { assertCurrentCronSystemActor } from "@/lib/cron-system-actor";

const insightRoles = ["owner", "admin", "manager"] as const;
const activeInsightStatuses = [
  "open",
  "viewed",
  "actioned",
  "snoozed",
] as const;

const candidateSchema = z.object({
  entityType: z.string().trim().min(1).max(80),
  entityId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(180),
  detail: z.string().trim().min(1).max(600),
  evidence: z.record(z.unknown()),
  assumptions: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  ctaKey: z.string().trim().min(1).max(80),
  ctaPayload: z.record(z.unknown()).default({}),
  impactScore: z.number().min(0).max(100),
  urgencyScore: z.number().min(0).max(100),
  confidenceScore: z.number().min(0).max(100),
  actionabilityScore: z.number().min(0).max(100),
  estimatedValueMinMinor: z.number().int().nonnegative().optional(),
  estimatedValueMaxMinor: z.number().int().nonnegative().optional(),
  estimateCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
});

const runInsightEvaluationSchema = z.object({
  organizationId: z.string().uuid(),
  authorizationLocationId: z.string().uuid(),
  targetLocationId: z.string().uuid().optional(),
  ruleKey: z.string().trim().min(1).max(80),
  ruleVersion: z.number().int().positive().default(1),
  evaluatedAt: z.string().datetime({ offset: true }),
  sourceWatermark: z.string().datetime({ offset: true }),
  sourceMetricRunId: z.string().uuid().optional(),
  sourceHealthScoreSnapshotId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(8).max(150),
  candidates: z.array(candidateSchema).max(500),
  actor: evaluationActorSchema,
});

export type RunInsightEvaluationCommand = z.input<
  typeof runInsightEvaluationSchema
>;

export interface InsightEvaluationResult {
  runId: string;
  created: number;
  reopened: number;
  refreshed: number;
  suppressed: number;
  resolved: number;
  observedInsightIds: string[];
}

function locationCondition(locationId: string | undefined) {
  return locationId
    ? eq(insights.locationId, locationId)
    : isNull(insights.locationId);
}

function seriesKey(input: {
  ruleKey: string;
  locationId?: string;
  entityType: string;
  entityId?: string;
}): string {
  return [
    input.ruleKey,
    input.locationId ?? "organization",
    input.entityType,
    input.entityId ?? "aggregate",
  ].join(":");
}

async function appendStatus(
  tx: TransactionClient,
  input: {
    organizationId: string;
    insightId: string;
    fromStatus: Insight["status"] | null;
    toStatus: Insight["status"];
    reasonCode: string;
    actorUserId: string | null;
    ruleRunId?: string;
    idempotencyKey: string;
    changedAt: Date;
  }
): Promise<void> {
  await tx.insert(insightStatusHistory).values(input);
}

async function assertInsightAccess(
  tx: TransactionClient,
  input: {
    organizationId: string;
    authorizationLocationId: string;
    insight: Insight;
    actor: EvaluationActor;
  }
) {
  if ("type" in input.actor) {
    await assertSystemOperationalScope(tx, {
      organizationId: input.organizationId,
      locationId: input.insight.locationId ?? input.authorizationLocationId,
      actor: input.actor,
    });
    return;
  }
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.insight.locationId ?? input.authorizationLocationId,
    actor: input.actor,
    intent: "write",
    allowedRoles: insightRoles,
  });
  if (!input.insight.locationId && member.locationScopeMode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Un manager de sede no puede accionar agregados de organización",
      403
    );
  }
  return member;
}

export async function runInsightEvaluation(
  command: RunInsightEvaluationCommand
): Promise<InsightEvaluationResult> {
  const input = runInsightEvaluationSchema.parse(command);
  const evaluatedAt = new Date(input.evaluatedAt);

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    if ("type" in input.actor) {
      await assertSystemOperationalScope(tx, {
        organizationId: input.organizationId,
        locationId: input.authorizationLocationId,
        actor: input.actor,
      });
    } else {
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: input.authorizationLocationId,
        actor: input.actor,
        intent: "write",
        allowedRoles: ["owner", "admin"],
      });
    }
    if (input.targetLocationId) {
      if ("type" in input.actor) {
        await assertSystemOperationalScope(tx, {
          organizationId: input.organizationId,
          locationId: input.targetLocationId,
          actor: input.actor,
        });
      } else {
        await assertOperationalAccess(tx, {
          organizationId: input.organizationId,
          locationId: input.targetLocationId,
          actor: input.actor,
          intent: "write",
          allowedRoles: ["owner", "admin"],
        });
      }
    }

    const [prior] = await tx
      .select()
      .from(insightRuleRuns)
      .where(
        and(
          eq(insightRuleRuns.organizationId, input.organizationId),
          eq(insightRuleRuns.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (prior) {
      assertIdempotencyPayload(prior.result, {
        ruleKey: input.ruleKey,
        ruleVersion: input.ruleVersion,
        targetLocationId: input.targetLocationId ?? null,
      });
      return prior.result as unknown as InsightEvaluationResult;
    }

    const [rule] = await tx
      .select()
      .from(insightRuleVersions)
      .where(
        and(
          eq(insightRuleVersions.key, input.ruleKey),
          eq(insightRuleVersions.version, input.ruleVersion),
          eq(insightRuleVersions.status, "active")
        )
      )
      .limit(1);
    if (!rule) {
      throw new OperationalError(
        "NOT_FOUND",
        "Regla de insight no activa",
        404
      );
    }

    const [run] = await tx
      .insert(insightRuleRuns)
      .values({
        organizationId: input.organizationId,
        locationId: input.targetLocationId ?? null,
        ruleVersionId: rule.id,
        evaluatedAt,
        sourceWatermark: new Date(input.sourceWatermark),
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    const result: InsightEvaluationResult = {
      runId: run.id,
      created: 0,
      reopened: 0,
      refreshed: 0,
      suppressed: 0,
      resolved: 0,
      observedInsightIds: [],
    };

    for (const candidate of input.candidates) {
      const candidateSeriesKey = seriesKey({
        ruleKey: rule.key,
        locationId: input.targetLocationId,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
      });
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:insight:${candidateSeriesKey}`}, 0))`
      );
      const [latest] = await tx
        .select()
        .from(insights)
        .where(
          and(
            eq(insights.organizationId, input.organizationId),
            eq(insights.seriesKey, candidateSeriesKey)
          )
        )
        .orderBy(desc(insights.occurrence))
        .limit(1);
      const priorityScore = calculateInsightPriority(candidate);
      const common = {
        locationId: input.targetLocationId ?? null,
        ruleVersionId: rule.id,
        severity: rule.severity,
        priorityScore,
        impactScore: candidate.impactScore,
        urgencyScore: candidate.urgencyScore,
        confidenceScore: candidate.confidenceScore,
        actionabilityScore: candidate.actionabilityScore,
        entityType: candidate.entityType,
        entityId: candidate.entityId ?? null,
        title: candidate.title,
        detail: candidate.detail,
        evidence: candidate.evidence,
        assumptions: candidate.assumptions,
        ctaKey: candidate.ctaKey,
        ctaPayload: candidate.ctaPayload,
        estimatedValueMinMinor: candidate.estimatedValueMinMinor ?? null,
        estimatedValueMaxMinor: candidate.estimatedValueMaxMinor ?? null,
        estimateCurrency: candidate.estimateCurrency ?? null,
        sourceMetricRunId: input.sourceMetricRunId ?? null,
        sourceHealthScoreSnapshotId: input.sourceHealthScoreSnapshotId ?? null,
        lastSeenAt: evaluatedAt,
        updatedAt: evaluatedAt,
      };

      let insight: Insight;
      let shouldNotify = false;
      if (latest && activeInsightStatuses.includes(latest.status as never)) {
        const snoozeExpired =
          latest.status === "snoozed" &&
          latest.snoozedUntil !== null &&
          latest.snoozedUntil <= evaluatedAt;
        [insight] = await tx
          .update(insights)
          .set({
            ...common,
            status: snoozeExpired ? "open" : latest.status,
            snoozedUntil: snoozeExpired ? null : latest.snoozedUntil,
            version: latest.version + 1,
          })
          .where(eq(insights.id, latest.id))
          .returning();
        if (snoozeExpired) {
          result.reopened += 1;
          shouldNotify = true;
          await appendStatus(tx, {
            organizationId: input.organizationId,
            insightId: insight.id,
            fromStatus: "snoozed",
            toStatus: "open",
            reasonCode: "snooze_expired",
            actorUserId: null,
            ruleRunId: run.id,
            idempotencyKey: `${run.id}:${insight.id}:snooze-expired`,
            changedAt: evaluatedAt,
          });
        } else result.refreshed += 1;
      } else if (latest) {
        const terminalAt = latest.resolvedAt ?? latest.lastSeenAt;
        const withinCooldown =
          evaluatedAt.getTime() - terminalAt.getTime() <=
          rule.cooldownHours * 60 * 60 * 1000;
        if (withinCooldown && latest.status === "resolved") {
          [insight] = await tx
            .update(insights)
            .set({
              ...common,
              status: "open",
              resolvedAt: null,
              resolutionReason: null,
              version: latest.version + 1,
            })
            .where(eq(insights.id, latest.id))
            .returning();
          result.reopened += 1;
          shouldNotify = true;
          await appendStatus(tx, {
            organizationId: input.organizationId,
            insightId: insight.id,
            fromStatus: "resolved",
            toStatus: "open",
            reasonCode: "condition_returned_within_cooldown",
            actorUserId: null,
            ruleRunId: run.id,
            idempotencyKey: `${run.id}:${insight.id}:reopened`,
            changedAt: evaluatedAt,
          });
        } else if (withinCooldown && latest.status === "dismissed") {
          [insight] = await tx
            .update(insights)
            .set({ ...common, version: latest.version + 1 })
            .where(eq(insights.id, latest.id))
            .returning();
          result.suppressed += 1;
        } else {
          [insight] = await tx
            .insert(insights)
            .values({
              ...common,
              organizationId: input.organizationId,
              seriesKey: candidateSeriesKey,
              occurrence: latest.occurrence + 1,
              status: "open",
              detectedAt: evaluatedAt,
            })
            .returning();
          result.created += 1;
          shouldNotify = true;
          await appendStatus(tx, {
            organizationId: input.organizationId,
            insightId: insight.id,
            fromStatus: null,
            toStatus: "open",
            reasonCode: "detected",
            actorUserId: null,
            ruleRunId: run.id,
            idempotencyKey: `${run.id}:${insight.id}:detected`,
            changedAt: evaluatedAt,
          });
        }
      } else {
        [insight] = await tx
          .insert(insights)
          .values({
            ...common,
            organizationId: input.organizationId,
            seriesKey: candidateSeriesKey,
            occurrence: 1,
            status: "open",
            detectedAt: evaluatedAt,
          })
          .returning();
        result.created += 1;
        shouldNotify = true;
        await appendStatus(tx, {
          organizationId: input.organizationId,
          insightId: insight.id,
          fromStatus: null,
          toStatus: "open",
          reasonCode: "detected",
          actorUserId: null,
          ruleRunId: run.id,
          idempotencyKey: `${run.id}:${insight.id}:detected`,
          changedAt: evaluatedAt,
        });
      }

      await tx.insert(insightRunObservations).values({
        organizationId: input.organizationId,
        ruleRunId: run.id,
        insightId: insight.id,
        observedAt: evaluatedAt,
      });
      result.observedInsightIds.push(insight.id);
      if (shouldNotify) {
        await tx
          .insert(insightNotifications)
          .values({
            organizationId: input.organizationId,
            insightId: insight.id,
            channel: "in_app",
            deliveryWindowKey: `${rule.key}:${input.evaluatedAt.slice(0, 10)}`,
            availableAt: evaluatedAt,
          })
          .onConflictDoNothing();
      }
    }

    const active = await tx
      .select()
      .from(insights)
      .where(
        and(
          eq(insights.organizationId, input.organizationId),
          eq(insights.ruleVersionId, rule.id),
          locationCondition(input.targetLocationId),
          inArray(insights.status, activeInsightStatuses)
        )
      )
      .limit(1000);
    const observed = new Set(result.observedInsightIds);
    for (const insight of active.filter((item) => !observed.has(item.id))) {
      await tx
        .update(insights)
        .set({
          status: "resolved",
          resolvedAt: evaluatedAt,
          resolutionReason: "condition_cleared",
          version: insight.version + 1,
          updatedAt: evaluatedAt,
        })
        .where(eq(insights.id, insight.id));
      await appendStatus(tx, {
        organizationId: input.organizationId,
        insightId: insight.id,
        fromStatus: insight.status,
        toStatus: "resolved",
        reasonCode: "condition_cleared",
        actorUserId: null,
        ruleRunId: run.id,
        idempotencyKey: `${run.id}:${insight.id}:cleared`,
        changedAt: evaluatedAt,
      });
      result.resolved += 1;
    }

    const persistedResult = {
      ...result,
      ruleKey: input.ruleKey,
      ruleVersion: input.ruleVersion,
      targetLocationId: input.targetLocationId ?? null,
    };
    await tx
      .update(insightRuleRuns)
      .set({
        status: "succeeded",
        candidateCount: input.candidates.length,
        result: persistedResult,
        completedAt: evaluatedAt,
      })
      .where(eq(insightRuleRuns.id, run.id));
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.targetLocationId ?? null,
      actorUserId: "type" in input.actor ? null : input.actor.userId,
      action: "insights.evaluated",
      targetType: "insight_rule_run",
      targetId: run.id,
      idempotencyKey: `audit:${input.idempotencyKey}`,
      after: persistedResult,
      metadata:
        "type" in input.actor
          ? {
              actor_type: "system",
              job_key: input.actor.jobKey,
              correlation_id: input.actor.correlationId,
            }
          : { actor_type: "user" },
    });
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.targetLocationId ?? null,
      eventName: "insights.evaluated",
      aggregateType: "insight_rule_run",
      aggregateId: run.id,
      idempotencyKey: `outbox:${input.idempotencyKey}`,
      payload: {
        ruleKey: input.ruleKey,
        created: result.created,
        reopened: result.reopened,
        resolved: result.resolved,
      },
      occurredAt: evaluatedAt,
    });
    return result;
  });
}

const dispositionSchema = z.discriminatedUnion("transition", [
  z.object({
    transition: z.literal("view"),
    organizationId: z.string().uuid(),
    authorizationLocationId: z.string().uuid(),
    insightId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(8).max(150),
    actor: operationalActorSchema,
  }),
  z.object({
    transition: z.literal("snooze"),
    organizationId: z.string().uuid(),
    authorizationLocationId: z.string().uuid(),
    insightId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    snoozedUntil: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().trim().min(8).max(150),
    actor: operationalActorSchema,
  }),
  z.object({
    transition: z.literal("dismiss"),
    organizationId: z.string().uuid(),
    authorizationLocationId: z.string().uuid(),
    insightId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(3).max(300),
    idempotencyKey: z.string().trim().min(8).max(150),
    actor: operationalActorSchema,
  }),
]);

export async function changeInsightDisposition(
  command: z.input<typeof dispositionSchema>
): Promise<Insight> {
  const input = dispositionSchema.parse(command);
  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const [prior] = await tx
      .select()
      .from(insightStatusHistory)
      .where(
        and(
          eq(insightStatusHistory.organizationId, input.organizationId),
          eq(insightStatusHistory.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (prior) {
      if (prior.insightId !== input.insightId) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "Clave reutilizada",
          409
        );
      }
      const [current] = await tx
        .select()
        .from(insights)
        .where(
          and(
            eq(insights.organizationId, input.organizationId),
            eq(insights.id, input.insightId)
          )
        )
        .limit(1);
      return current;
    }
    const [insight] = await tx
      .select()
      .from(insights)
      .where(
        and(
          eq(insights.organizationId, input.organizationId),
          eq(insights.id, input.insightId)
        )
      )
      .limit(1);
    if (!insight)
      throw new OperationalError("NOT_FOUND", "Insight no encontrado", 404);
    await assertInsightAccess(tx, { ...input, insight });
    if (insight.version !== input.expectedVersion) {
      throw new OperationalError("VERSION_CONFLICT", "El insight cambió", 409);
    }
    if (insight.status === "resolved" || insight.status === "dismissed") {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "El insight ya está cerrado",
        409
      );
    }
    const now = new Date();
    const nextStatus =
      input.transition === "view"
        ? "viewed"
        : input.transition === "snooze"
          ? "snoozed"
          : "dismissed";
    if (
      input.transition === "snooze" &&
      new Date(input.snoozedUntil).getTime() <= now.getTime()
    ) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "El snooze debe terminar en el futuro",
        422
      );
    }
    const [updated] = await tx
      .update(insights)
      .set({
        status: nextStatus,
        viewedAt: input.transition === "view" ? now : insight.viewedAt,
        snoozedUntil:
          input.transition === "snooze" ? new Date(input.snoozedUntil) : null,
        resolutionReason:
          input.transition === "dismiss"
            ? input.reason
            : insight.resolutionReason,
        resolvedAt: input.transition === "dismiss" ? now : insight.resolvedAt,
        version: insight.version + 1,
        updatedAt: now,
      })
      .where(eq(insights.id, insight.id))
      .returning();
    await appendStatus(tx, {
      organizationId: input.organizationId,
      insightId: insight.id,
      fromStatus: insight.status,
      toStatus: nextStatus,
      reasonCode:
        input.transition === "dismiss" ? "user_dismissed" : input.transition,
      actorUserId: input.actor.userId,
      idempotencyKey: input.idempotencyKey,
      changedAt: now,
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: insight.locationId,
      actorUserId: input.actor.userId,
      action: `insight.${input.transition}`,
      targetType: "insight",
      targetId: insight.id,
      idempotencyKey: `audit:${input.idempotencyKey}`,
      before: { status: insight.status, version: insight.version },
      after: { status: nextStatus, version: updated.version },
    });
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: insight.locationId,
      eventName: `insight.${nextStatus}`,
      aggregateType: "insight",
      aggregateId: insight.id,
      idempotencyKey: `outbox:${input.idempotencyKey}`,
      payload: { status: nextStatus, ruleVersionId: insight.ruleVersionId },
      occurredAt: now,
    });
    return updated;
  });
}

const recordActionSchema = z.object({
  organizationId: z.string().uuid(),
  authorizationLocationId: z.string().uuid(),
  insightId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  actionKey: z.string().trim().min(1).max(80),
  targetEntityType: z.string().trim().min(1).max(80),
  targetEntityId: z.string().uuid().optional(),
  beforeValue: z.record(z.unknown()),
  evaluationWindowDays: z.number().int().min(1).max(365),
  idempotencyKey: z.string().trim().min(8).max(150),
  actor: operationalActorSchema,
});

const groupSimulationInputSchema = z
  .object({
    simulationInput: z
      .object({
        proposedCapacity: z.number().int().min(1).max(100),
        monthlyPriceMinor: z.number().int().min(0).max(10_000_000).nullable(),
      })
      .strict(),
  })
  .strict();

export async function recordInsightAction(
  command: z.input<typeof recordActionSchema>
): Promise<InsightAction> {
  const input = recordActionSchema.parse(command);
  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const [prior] = await tx
      .select()
      .from(insightActions)
      .where(
        and(
          eq(insightActions.organizationId, input.organizationId),
          eq(insightActions.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (prior) {
      if (
        prior.insightId !== input.insightId ||
        prior.actionKey !== input.actionKey
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "Clave reutilizada",
          409
        );
      }
      if (input.actionKey === "simulate_group") {
        const requested = groupSimulationInputSchema.safeParse(input.beforeValue);
        const stored = prior.beforeValue as {
          simulation?: { proposedCapacity?: number; monthlyPriceMinor?: number | null };
        };
        if (
          !requested.success ||
          stored.simulation?.proposedCapacity !==
            requested.data.simulationInput.proposedCapacity ||
          stored.simulation?.monthlyPriceMinor !==
            requested.data.simulationInput.monthlyPriceMinor
        ) {
          throw new OperationalError(
            "IDEMPOTENCY_CONFLICT",
            "Clave reutilizada con otra simulación",
            409
          );
        }
      }
      return prior;
    }
    const [insight] = await tx
      .select()
      .from(insights)
      .where(
        and(
          eq(insights.organizationId, input.organizationId),
          eq(insights.id, input.insightId)
        )
      )
      .limit(1);
    if (!insight)
      throw new OperationalError("NOT_FOUND", "Insight no encontrado", 404);
    const member = await assertInsightAccess(tx, { ...input, insight });
    if (!member) {
      throw new OperationalError(
        "FORBIDDEN",
        "Una acción de insight requiere un miembro humano",
        403
      );
    }
    if (insight.version !== input.expectedVersion) {
      throw new OperationalError("VERSION_CONFLICT", "El insight cambió", 409);
    }
    if (
      input.actionKey !== insight.ctaKey ||
      input.targetEntityType !== insight.entityType ||
      (input.targetEntityId ?? null) !== insight.entityId
    ) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La acción no corresponde al insight",
        422
      );
    }
    let persistedBeforeValue = input.beforeValue;
    if (input.actionKey === "simulate_group") {
      const parsedSimulation = groupSimulationInputSchema.safeParse(
        input.beforeValue
      );
      const sourceEvidence =
        typeof insight.evidence === "object" && insight.evidence !== null
          ? (insight.evidence as Record<string, unknown>)
          : {};
      const eligibleDemand = sourceEvidence.eligibleWaitlist;
      if (
        !parsedSimulation.success ||
        !Number.isInteger(eligibleDemand) ||
        Number(eligibleDemand) < 0
      ) {
        throw new OperationalError(
          "INVALID_RELATION",
          "La simulación requiere demanda agregada válida",
          422
        );
      }
      const [organization] = await tx
        .select({ defaultCurrency: organizations.defaultCurrency })
        .from(organizations)
        .where(eq(organizations.id, insight.organizationId))
        .limit(1);
      if (!organization) {
        throw new OperationalError("NOT_FOUND", "Academia no encontrada", 404);
      }
      const simulationInput = parsedSimulation.data.simulationInput;
      const scenarios = calculateGroupSimulation({
        eligibleDemand: Number(eligibleDemand),
        proposedCapacity: simulationInput.proposedCapacity,
        monthlyPriceMinor: simulationInput.monthlyPriceMinor ?? undefined,
      });
      persistedBeforeValue = {
        eligibleWaitlist: Number(eligibleDemand),
        simulation: {
          proposedCapacity: simulationInput.proposedCapacity,
          monthlyPriceMinor: simulationInput.monthlyPriceMinor,
          currency: organization.defaultCurrency,
          scenarios: scenarios.map((scenario) => ({
            key: scenario.key,
            conversionRate: scenario.conversionRate,
            estimatedEnrollments: scenario.estimatedEnrollments,
            grossMonthlyMinor: scenario.grossMonthlyMinor,
          })),
          assumption: "Uncalibrated sensitivity scenarios; no benchmark.",
        },
      };
    }
    if (!["open", "viewed", "snoozed"].includes(insight.status)) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "El insight no admite nuevas acciones",
        409
      );
    }
    const now = new Date();
    const evaluationEndsAt = new Date(now);
    evaluationEndsAt.setUTCDate(
      evaluationEndsAt.getUTCDate() + input.evaluationWindowDays
    );
    const [action] = await tx
      .insert(insightActions)
      .values({
        organizationId: input.organizationId,
        locationId: insight.locationId,
        insightId: insight.id,
        actionKey: input.actionKey,
        actorUserId: input.actor.userId,
        actorMemberId: member.id,
        targetEntityType: input.targetEntityType,
        targetEntityId: input.targetEntityId ?? null,
        beforeValue: persistedBeforeValue,
        evaluationEndsAt,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    await tx
      .update(insights)
      .set({
        status: "actioned",
        snoozedUntil: null,
        version: insight.version + 1,
        updatedAt: now,
      })
      .where(eq(insights.id, insight.id));
    await appendStatus(tx, {
      organizationId: input.organizationId,
      insightId: insight.id,
      fromStatus: insight.status,
      toStatus: "actioned",
      reasonCode: input.actionKey,
      actorUserId: input.actor.userId,
      idempotencyKey: `status:${input.idempotencyKey}`,
      changedAt: now,
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: insight.locationId,
      actorUserId: input.actor.userId,
      action: "insight.action_recorded",
      targetType: "insight_action",
      targetId: action.id,
      idempotencyKey: `audit:${input.idempotencyKey}`,
      after: {
        insightId: insight.id,
        actionKey: input.actionKey,
        evaluationEndsAt: evaluationEndsAt.toISOString(),
      },
    });
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: insight.locationId,
      eventName: "insight.action_started",
      aggregateType: "insight_action",
      aggregateId: action.id,
      idempotencyKey: `outbox:${input.idempotencyKey}`,
      payload: { insightId: insight.id, actionKey: input.actionKey },
      occurredAt: now,
    });
    return action;
  });
}

const completeActionSchema = z.object({
  organizationId: z.string().uuid(),
  authorizationLocationId: z.string().uuid(),
  actionId: z.string().uuid(),
  outcome: z.enum(["positive", "neutral", "negative", "not_measurable"]),
  afterValue: z.record(z.unknown()),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(150),
  actor: operationalActorSchema,
});

export async function completeInsightAction(
  command: z.input<typeof completeActionSchema>
): Promise<InsightAction> {
  const input = completeActionSchema.parse(command);
  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const [priorAudit] = await tx
      .select({ targetId: auditLog.targetId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, input.organizationId),
          eq(auditLog.idempotencyKey, `audit:${input.idempotencyKey}`)
        )
      )
      .limit(1);
    if (priorAudit) {
      if (priorAudit.targetId !== input.actionId) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "Clave reutilizada",
          409
        );
      }
      const [prior] = await tx
        .select()
        .from(insightActions)
        .where(eq(insightActions.id, input.actionId))
        .limit(1);
      return prior;
    }
    const [action] = await tx
      .select()
      .from(insightActions)
      .where(
        and(
          eq(insightActions.organizationId, input.organizationId),
          eq(insightActions.id, input.actionId)
        )
      )
      .for("update")
      .limit(1);
    if (!action)
      throw new OperationalError("NOT_FOUND", "Acción no encontrada", 404);
    const [insight] = await tx
      .select()
      .from(insights)
      .where(
        and(
          eq(insights.organizationId, input.organizationId),
          eq(insights.id, action.insightId)
        )
      )
      .limit(1);
    if (!insight)
      throw new OperationalError("NOT_FOUND", "Insight no encontrado", 404);
    await assertInsightAccess(tx, { ...input, insight });
    if (action.status === "completed") return action;
    const now = new Date();
    const [completed] = await tx
      .update(insightActions)
      .set({
        status: "completed",
        outcome: input.outcome,
        afterValue: input.afterValue,
        outcomeNotes: input.notes ?? null,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(insightActions.id, action.id))
      .returning();
    await tx
      .update(insights)
      .set({
        status: "resolved",
        resolvedAt: now,
        resolutionReason: "action_evaluated",
        version: insight.version + 1,
        updatedAt: now,
      })
      .where(eq(insights.id, insight.id));
    await appendStatus(tx, {
      organizationId: input.organizationId,
      insightId: insight.id,
      fromStatus: insight.status,
      toStatus: "resolved",
      reasonCode: "action_evaluated",
      actorUserId: input.actor.userId,
      idempotencyKey: `status:${input.idempotencyKey}`,
      changedAt: now,
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: insight.locationId,
      actorUserId: input.actor.userId,
      action: "insight.action_completed",
      targetType: "insight_action",
      targetId: action.id,
      idempotencyKey: `audit:${input.idempotencyKey}`,
      before: { outcome: action.outcome },
      after: { outcome: input.outcome },
    });
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: insight.locationId,
      eventName: "insight.action_completed",
      aggregateType: "insight_action",
      aggregateId: action.id,
      idempotencyKey: `outbox:${input.idempotencyKey}`,
      payload: { insightId: insight.id, outcome: input.outcome },
      occurredAt: now,
    });
    return completed;
  });
}

export async function closeExpiredInsightActions(
  actor: SystemActor,
  batchSize = 50
): Promise<{ scanned: number; closed: number }> {
  assertCurrentCronSystemActor(actor);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new RangeError("batchSize debe estar entre 1 y 100");
  }
  return db.transaction(async (tx) => {
    const due = await tx.execute(sql`
      select action.id, action.organization_id, action.location_id,
        action.insight_id, action.action_key, action.outcome
      from zaltyko.insight_actions action
      where action.status = 'recorded' and action.outcome = 'pending'
        and action.evaluation_ends_at <= now()
      order by action.evaluation_ends_at asc, action.id asc
      for update of action skip locked
      limit ${batchSize}
    `);
    const actions = due.rows as unknown as Array<{
      id: string;
      organization_id: string;
      location_id: string | null;
      insight_id: string;
      action_key: string;
      outcome: string;
    }>;
    let closed = 0;
    for (const action of actions) {
      assertCurrentCronSystemActor(actor);
      const [organization] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, action.organization_id),
            inArray(organizations.status, ["trial", "active"])
          )
        )
        .limit(1);
      if (!organization) continue;
      if (action.location_id) {
        const [location] = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(
            and(
              eq(locations.organizationId, action.organization_id),
              eq(locations.id, action.location_id)
            )
          )
          .limit(1);
        if (!location) continue;
      }
      const [insight] = await tx
        .select()
        .from(insights)
        .where(
          and(
            eq(insights.organizationId, action.organization_id),
            eq(insights.id, action.insight_id)
          )
        )
        .for("update")
        .limit(1);
      if (!insight) continue;
      const now = new Date();
      const [completed] = await tx
        .update(insightActions)
        .set({
          status: "completed",
          outcome: "not_measurable",
          afterValue: {},
          outcomeNotes:
            "Ventana finalizada sin evidencia suficiente; no se atribuye impacto automáticamente.",
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(insightActions.organizationId, action.organization_id),
            eq(insightActions.id, action.id),
            eq(insightActions.status, "recorded"),
            eq(insightActions.outcome, "pending")
          )
        )
        .returning();
      if (!completed) continue;
      const idempotencyKey = `expired-outcome:${action.id}`;
      if (insight.status === "actioned") {
        await tx
          .update(insights)
          .set({
            status: "resolved",
            resolvedAt: now,
            resolutionReason: "evaluation_window_expired",
            version: insight.version + 1,
            updatedAt: now,
          })
          .where(eq(insights.id, insight.id));
        await tx.insert(insightStatusHistory).values({
          organizationId: action.organization_id,
          insightId: insight.id,
          fromStatus: "actioned",
          toStatus: "resolved",
          reasonCode: "evaluation_window_expired",
          actorUserId: null,
          idempotencyKey: `status:${idempotencyKey}`,
          changedAt: now,
          metadata: { actorType: "system", jobKey: actor.jobKey },
        });
      }
      await appendAuditEntry(tx, {
        organizationId: action.organization_id,
        locationId: action.location_id,
        actorUserId: null,
        action: "insight.action_outcome_not_measurable",
        targetType: "insight_action",
        targetId: action.id,
        idempotencyKey: `audit:${idempotencyKey}`,
        before: { outcome: action.outcome },
        after: { outcome: "not_measurable" },
        metadata: { actorType: "system", jobKey: actor.jobKey },
      });
      await appendOutboxEvent(tx, {
        organizationId: action.organization_id,
        locationId: action.location_id,
        eventName: "insight.action_completed",
        aggregateType: "insight_action",
        aggregateId: action.id,
        idempotencyKey: `outbox:${idempotencyKey}`,
        payload: {
          insightId: action.insight_id,
          actionKey: action.action_key,
          outcome: "not_measurable",
          reason: "evaluation_window_expired_without_evidence",
        },
        occurredAt: now,
      });
      closed += 1;
    }
    return { scanned: actions.length, closed };
  });
}
