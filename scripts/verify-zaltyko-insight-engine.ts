import assert from "node:assert/strict";

import { Pool } from "pg";

import { withCronSystemActor } from "@/lib/cron-system-actor";
import { consumeMetricInvalidationEvent } from "@/modules/analytics/application/metric-engine";
import {
  closeExpiredInsightActions,
  changeInsightDisposition,
  completeInsightAction,
  recordInsightAction,
  runInsightEvaluation,
} from "@/modules/insights/application/insight-service";
import { evaluateP0Insights } from "@/modules/insights/application/evaluate-p0-rules";
import { listInsights } from "@/modules/insights/application/insight-query";
import { evaluateExcessDemand } from "@/modules/insights/domain/insight-rules";
import type { SystemActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
process.env.CRON_SECRET = "synthetic-worker-secret";

const ID = {
  org: "20000000-0000-0000-0000-000000000001",
  north: "20000000-0000-0000-0000-000000000011",
  ownerUser: "20000000-0000-0000-0000-000000000101",
  ownerMember: "20000000-0000-0000-0000-000000000201",
  managerUser: "20000000-0000-0000-0000-000000000102",
  managerMember: "20000000-0000-0000-0000-000000000202",
  foreignOrg: "10000000-0000-0000-0000-000000000001",
  foreignLocation: "10000000-0000-0000-0000-000000000011",
  foreignUser: "10000000-0000-0000-0000-000000000101",
  foreignMember: "10000000-0000-0000-0000-000000000201",
  classA: "20000000-0000-0000-0000-000000000801",
  classB: "20000000-0000-0000-0000-000000000802",
};
const owner = { userId: ID.ownerUser, memberId: ID.ownerMember };
const manager = { userId: ID.managerUser, memberId: ID.managerMember };

async function expectOperationalError(
  operation: () => Promise<unknown>,
  code: OperationalError["code"]
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert(error instanceof OperationalError);
    assert.equal(error.code, code);
    return true;
  });
}

async function count(table: string, where = "true"): Promise<number> {
  const result = await pool.query(
    `select count(*)::int as count from ${table} where ${where}`
  );
  return Number(result.rows[0].count);
}

async function asSyntheticCron<T>(
  job: (actor: SystemActor) => Promise<T>
): Promise<T> {
  const result = await withCronSystemActor(
    new Request("http://localhost/api/cron/zaltyko-outbox", {
      headers: { authorization: "Bearer synthetic-worker-secret" },
    }),
    job
  );
  if (!result.ok)
    throw new Error("La autenticación cron sintética fue denegada");
  return result.value;
}

function iso(base: Date, minutes: number): string {
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

async function loadInsight(entityId: string) {
  const result = await pool.query(
    `select id, status, version, occurrence, estimated_value_min_minor::int as min,
            estimated_value_max_minor::int as max, assumptions
     from zaltyko.insights
     where organization_id = $1 and entity_id = $2
     order by occurrence desc limit 1`,
    [ID.org, entityId]
  );
  return result.rows[0] as {
    id: string;
    status: string;
    version: number;
    occurrence: number;
    min: number;
    max: number;
    assumptions: string[];
  };
}

async function main(): Promise<void> {
  const base = new Date();
  base.setSeconds(0, 0);
  const candidateA = evaluateExcessDemand({
    classTemplateId: ID.classA,
    fillRate: 0.92,
    eligibleWaitlist: 3,
    observedSessions: 4,
    monthlyPriceMinor: 6000,
    currency: "EUR",
  });
  assert(candidateA);

  await expectOperationalError(
    () =>
      runInsightEvaluation({
        organizationId: ID.org,
        authorizationLocationId: ID.foreignLocation,
        ruleKey: "excess_demand",
        evaluatedAt: iso(base, 0),
        sourceWatermark: iso(base, 0),
        idempotencyKey: "insight-foreign-denied",
        candidates: [candidateA],
        actor: { userId: ID.foreignUser, memberId: ID.foreignMember },
      }),
    "FORBIDDEN"
  );

  const firstCommand = {
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    ruleKey: "excess_demand",
    evaluatedAt: iso(base, 0),
    sourceWatermark: iso(base, 0),
    idempotencyKey: "insight-excess-demand-run-001",
    candidates: [candidateA],
    actor: owner,
  };
  const concurrent = await Promise.all([
    runInsightEvaluation(firstCommand),
    runInsightEvaluation(firstCommand),
    runInsightEvaluation(firstCommand),
  ]);
  assert.equal(new Set(concurrent.map((item) => item.runId)).size, 1);
  assert.equal(await count("zaltyko.insight_rule_runs"), 1);
  assert.equal(await count("zaltyko.insights"), 1);
  assert.equal(await count("zaltyko.insight_notifications"), 1);

  const ownerInbox = await listInsights({
    userId: ID.ownerUser,
    organizationId: ID.org,
  });
  assert.equal(ownerInbox.items.length, 1);
  assert.equal(ownerInbox.items[0].ctaKey, "simulate_group");
  assert.equal(ownerInbox.items[0].estimatedValueMinMinor, 9000);
  assert.equal(ownerInbox.items[0].estimatedValueMaxMinor, 18000);
  assert(ownerInbox.items[0].assumptions.join(" ").includes("no garantiza"));

  const managerInbox = await listInsights({
    userId: ID.managerUser,
    organizationId: ID.org,
  });
  assert.equal(managerInbox.scope.locationId, ID.north);
  assert.equal(managerInbox.items.length, 0);

  let insightA = await loadInsight(ID.classA);
  assert.equal(insightA.status, "open");
  assert.equal(insightA.min, 9000);
  assert.equal(insightA.max, 18000);
  assert(insightA.assumptions.join(" ").includes("no garantiza"));

  const refreshed = await runInsightEvaluation({
    ...firstCommand,
    evaluatedAt: iso(base, 1),
    sourceWatermark: iso(base, 1),
    idempotencyKey: "insight-excess-demand-run-002",
  });
  assert.equal(refreshed.refreshed, 1);
  assert.equal(await count("zaltyko.insights"), 1);

  const cleared = await runInsightEvaluation({
    ...firstCommand,
    evaluatedAt: iso(base, 2),
    sourceWatermark: iso(base, 2),
    idempotencyKey: "insight-excess-demand-run-003",
    candidates: [],
  });
  assert.equal(cleared.resolved, 1);
  insightA = await loadInsight(ID.classA);
  assert.equal(insightA.status, "resolved");

  const reopened = await runInsightEvaluation({
    ...firstCommand,
    evaluatedAt: iso(base, 3),
    sourceWatermark: iso(base, 3),
    idempotencyKey: "insight-excess-demand-run-004",
  });
  assert.equal(reopened.reopened, 1);
  insightA = await loadInsight(ID.classA);
  assert.equal(insightA.occurrence, 1);
  assert.equal(await count("zaltyko.insight_notifications"), 1);

  await expectOperationalError(
    () =>
      changeInsightDisposition({
        transition: "view",
        organizationId: ID.org,
        authorizationLocationId: ID.north,
        insightId: insightA.id,
        expectedVersion: insightA.version,
        idempotencyKey: "insight-manager-aggregate-denied",
        actor: manager,
      }),
    "LOCATION_SCOPE_DENIED"
  );

  const snoozedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const snoozed = await changeInsightDisposition({
    transition: "snooze",
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    insightId: insightA.id,
    expectedVersion: insightA.version,
    snoozedUntil,
    idempotencyKey: "insight-snooze-001",
    actor: owner,
  });
  const snoozeRetry = await changeInsightDisposition({
    transition: "snooze",
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    insightId: insightA.id,
    expectedVersion: insightA.version,
    snoozedUntil,
    idempotencyKey: "insight-snooze-001",
    actor: owner,
  });
  assert.equal(snoozed.status, "snoozed");
  assert.equal(snoozeRetry.id, snoozed.id);

  await expectOperationalError(
    () =>
      recordInsightAction({
        organizationId: ID.org,
        authorizationLocationId: ID.north,
        insightId: insightA.id,
        expectedVersion: insightA.version,
        actionKey: "simulate_group",
        targetEntityType: "class_template",
        targetEntityId: ID.classA,
        beforeValue: {
          simulationInput: { proposedCapacity: 8, monthlyPriceMinor: 6000 },
        },
        evaluationWindowDays: 30,
        idempotencyKey: "insight-action-stale-version",
        actor: owner,
      }),
    "VERSION_CONFLICT"
  );

  insightA = await loadInsight(ID.classA);
  await expectOperationalError(
    () =>
      recordInsightAction({
        organizationId: ID.org,
        authorizationLocationId: ID.north,
        insightId: insightA.id,
        expectedVersion: insightA.version,
        actionKey: "simulate_group",
        targetEntityType: "class_template",
        targetEntityId: ID.classA,
        beforeValue: { privateNote: "no debe persistirse" },
        evaluationWindowDays: 30,
        idempotencyKey: "insight-action-malformed-simulation",
        actor: owner,
      }),
    "INVALID_RELATION"
  );
  const action = await recordInsightAction({
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    insightId: insightA.id,
    expectedVersion: insightA.version,
    actionKey: "simulate_group",
    targetEntityType: "class_template",
    targetEntityId: ID.classA,
    beforeValue: {
      simulationInput: { proposedCapacity: 8, monthlyPriceMinor: 6000 },
    },
    evaluationWindowDays: 30,
    idempotencyKey: "insight-action-001",
    actor: owner,
  });
  const actionRetry = await recordInsightAction({
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    insightId: insightA.id,
    expectedVersion: insightA.version,
    actionKey: "simulate_group",
    targetEntityType: "class_template",
    targetEntityId: ID.classA,
    beforeValue: {
      simulationInput: { proposedCapacity: 8, monthlyPriceMinor: 6000 },
    },
    evaluationWindowDays: 30,
    idempotencyKey: "insight-action-001",
    actor: owner,
  });
  assert.equal(actionRetry.id, action.id);
  assert.deepEqual(action.beforeValue, {
    eligibleWaitlist: 3,
    simulation: {
      proposedCapacity: 8,
      monthlyPriceMinor: 6000,
      currency: "EUR",
      scenarios: [
        { key: "low", conversionRate: 0.5, estimatedEnrollments: 1, grossMonthlyMinor: 6000 },
        { key: "base", conversionRate: 0.75, estimatedEnrollments: 2, grossMonthlyMinor: 12000 },
        { key: "high", conversionRate: 1, estimatedEnrollments: 3, grossMonthlyMinor: 18000 },
      ],
      assumption: "Uncalibrated sensitivity scenarios; no benchmark.",
    },
  });
  await expectOperationalError(
    () =>
      recordInsightAction({
        organizationId: ID.org,
        authorizationLocationId: ID.north,
        insightId: insightA.id,
        expectedVersion: insightA.version,
        actionKey: "simulate_group",
        targetEntityType: "class_template",
        targetEntityId: ID.classA,
        beforeValue: {
          simulationInput: { proposedCapacity: 7, monthlyPriceMinor: 6000 },
        },
        evaluationWindowDays: 30,
        idempotencyKey: "insight-action-001",
        actor: owner,
      }),
    "IDEMPOTENCY_CONFLICT"
  );
  assert.equal(await count("zaltyko.insight_actions"), 1);

  const completed = await completeInsightAction({
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    actionId: action.id,
    outcome: "positive",
    afterValue: { fillRate: 0.86, convertedWaitlist: 2 },
    notes: "Resultado sintético de aceptación",
    idempotencyKey: "insight-outcome-001",
    actor: owner,
  });
  const completedRetry = await completeInsightAction({
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    actionId: action.id,
    outcome: "positive",
    afterValue: { fillRate: 0.86, convertedWaitlist: 2 },
    notes: "Resultado sintético de aceptación",
    idempotencyKey: "insight-outcome-001",
    actor: owner,
  });
  assert.equal(completed.outcome, "positive");
  assert.equal(completedRetry.id, completed.id);
  insightA = await loadInsight(ID.classA);
  assert.equal(insightA.status, "resolved");

  const candidateB = evaluateExcessDemand({
    classTemplateId: ID.classB,
    fillRate: 0.95,
    eligibleWaitlist: 4,
    observedSessions: 5,
  });
  assert(candidateB);
  await runInsightEvaluation({
    ...firstCommand,
    evaluatedAt: iso(base, 4),
    sourceWatermark: iso(base, 4),
    idempotencyKey: "insight-excess-demand-run-005",
    candidates: [candidateB],
  });
  let insightB = await loadInsight(ID.classB);
  const dismissed = await changeInsightDisposition({
    transition: "dismiss",
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    insightId: insightB.id,
    expectedVersion: insightB.version,
    reason: "No encaja con el calendario sintético",
    idempotencyKey: "insight-dismiss-001",
    actor: owner,
  });
  assert.equal(dismissed.status, "dismissed");
  const suppressed = await runInsightEvaluation({
    ...firstCommand,
    evaluatedAt: iso(base, 5),
    sourceWatermark: iso(base, 5),
    idempotencyKey: "insight-excess-demand-run-006",
    candidates: [candidateB],
  });
  assert.equal(suppressed.suppressed, 1);
  insightB = await loadInsight(ID.classB);
  assert.equal(insightB.status, "dismissed");
  assert.equal(await count("zaltyko.insights"), 2);

  await assert.rejects(
    pool.query(
      `update zaltyko.insight_status_history set reason_code = 'tampered' where insight_id = $1`,
      [insightA.id]
    ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "55000");
      return true;
    }
  );

  const unsafe = await count(
    "zaltyko.insights",
    `evidence::text ~* '\"(email|phone|name|address|medical|secret|token)\"'`
  );
  assert.equal(unsafe, 0);

  // Deterministic synthetic fact for the SQL-to-candidate path (no coach assigned).
  await pool.query(
    `update zaltyko.sessions set starts_at = $2, ends_at = $3, updated_at = now() where organization_id = $1 and id = '20000000-0000-0000-0000-000000000901'`,
    [
      ID.org,
      new Date(base.getTime() + 48 * 60 * 60 * 1000),
      new Date(base.getTime() + 49 * 60 * 60 * 1000),
    ]
  );
  const p0Command = {
    organizationId: ID.org,
    locationId: ID.north,
    actor: owner,
    evaluatedAt: base.toISOString(),
    sourceWatermark: base.toISOString(),
    idempotencyPrefix: "p0-rules-synthetic-integration",
  };
  const p0Evaluation = await evaluateP0Insights(p0Command);
  assert.equal(p0Evaluation.evaluatedRules, 9);
  assert(p0Evaluation.candidates >= 1);
  const p0Retry = await evaluateP0Insights(p0Command);
  assert.deepEqual(
    p0Retry.results.map((result) => result.runId),
    p0Evaluation.results.map((result) => result.runId)
  );
  const insightEvent = await pool.query(
    `select id from zaltyko.outbox_events
     where organization_id = $1 and event_name = 'insights.evaluated'
     order by created_at desc limit 1`,
    [ID.org]
  );
  assert.equal(
    await consumeMetricInvalidationEvent({
      organizationId: ID.org,
      outboxEventId: String(insightEvent.rows[0].id),
    }),
    false
  );
  assert.equal(
    await count(
      "zaltyko.metric_invalidations",
      `outbox_event_id = '${String(insightEvent.rows[0].id)}'`
    ),
    0
  );

  await asSyntheticCron(async (systemActor) => {
    const p0SystemEvaluation = await evaluateP0Insights({
      ...p0Command,
      actor: systemActor,
      idempotencyPrefix: "p0-rules-system-synthetic-integration",
    });
    assert.equal(p0SystemEvaluation.evaluatedRules, 9);
    const systemAudit = await pool.query(
      `select actor_user_id, metadata from zaltyko.audit_log
       where organization_id = $1 and action = 'insights.evaluated'
         and metadata->>'actor_type' = 'system'`,
      [ID.org]
    );
    assert.equal(systemAudit.rows.length, 9);
    assert(systemAudit.rows.every((row) => row.actor_user_id === null));
  });

  const actionable = await pool.query(
    `select id, version, location_id, entity_type, entity_id, cta_key
     from zaltyko.insights
     where organization_id = $1 and location_id = $2
       and status in ('open', 'viewed') and cta_key <> 'simulate_group'
     order by priority_score desc, id asc limit 1`,
    [ID.org, ID.north]
  );
  assert.equal(actionable.rows.length, 1);
  const insightForExpiry = actionable.rows[0] as {
    id: string;
    version: number;
    location_id: string;
    entity_type: string;
    entity_id: string | null;
    cta_key: string;
  };
  const expiringAction = await recordInsightAction({
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    insightId: insightForExpiry.id,
    expectedVersion: insightForExpiry.version,
    actionKey: insightForExpiry.cta_key,
    targetEntityType: insightForExpiry.entity_type,
    targetEntityId: insightForExpiry.entity_id ?? undefined,
    beforeValue: { synthetic: true },
    evaluationWindowDays: 30,
    idempotencyKey: "insight-expiring-action-001",
    actor: owner,
  });
  await pool.query(
    `update zaltyko.insight_actions set evaluation_ends_at = now() - interval '1 second' where id = $1`,
    [expiringAction.id]
  );
  const humanCompletion = completeInsightAction({
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    actionId: expiringAction.id,
    outcome: "positive",
    afterValue: { syntheticMeasurement: true },
    idempotencyKey: "insight-expiring-human-outcome-001",
    actor: owner,
  });
  const workerCompletion = asSyntheticCron((systemActor) =>
    closeExpiredInsightActions(systemActor, 10)
  );
  const [humanOutcome, workerOutcome] = await Promise.all([
    humanCompletion,
    workerCompletion,
  ]);
  assert.equal(workerOutcome.scanned, workerOutcome.closed);
  assert(workerOutcome.closed === 0 || workerOutcome.closed === 1);
  assert.equal(humanOutcome.status, "completed");
  await asSyntheticCron(async (systemActor) => {
    const retryClose = await closeExpiredInsightActions(systemActor, 10);
    assert.deepEqual(retryClose, { scanned: 0, closed: 0 });
  });
  const expiredActionState = await pool.query(
    `select status, outcome, after_value, actor_user_id from zaltyko.insight_actions where id = $1`,
    [expiringAction.id]
  );
  assert.equal(expiredActionState.rows[0].status, "completed");
  assert(
    expiredActionState.rows[0].outcome === "not_measurable" ||
      expiredActionState.rows[0].outcome === "positive"
  );
  if (expiredActionState.rows[0].outcome === "not_measurable") {
    assert.deepEqual(expiredActionState.rows[0].after_value, {});
  } else {
    assert.deepEqual(expiredActionState.rows[0].after_value, {
      syntheticMeasurement: true,
    });
  }
  assert.equal(expiredActionState.rows[0].actor_user_id, ID.ownerUser);
  const expiryAudit = await pool.query(
    `select actor_user_id, action, after from zaltyko.audit_log where target_id = $1 and action in ('insight.action_outcome_not_measurable', 'insight.action_completed')`,
    [expiringAction.id]
  );
  assert.equal(expiryAudit.rows.length, 1);
  assert(
    expiryAudit.rows[0].actor_user_id === null ||
      expiryAudit.rows[0].actor_user_id === ID.ownerUser
  );

  console.log(
    JSON.stringify({
      status: "PASS",
      ac07: { min: 9000, max: 18000, guarantee: false },
      tripleDeliveryOneRun: concurrent[0].runId,
      insights: await count("zaltyko.insights"),
      notifications: await count("zaltyko.insight_notifications"),
      actionOutcome: completed.outcome,
      managerAggregateDenied: true,
      ownerInboxVisible: ownerInbox.items.length,
      managerInboxAggregateHidden: managerInbox.items.length === 0,
      historyImmutable: true,
      p0RulesExecuted: p0Evaluation.evaluatedRules,
      p0Candidates: p0Evaluation.candidates,
      p0RetryIsIdempotent: true,
      systemEvaluationWithoutImpersonation: true,
      expiredActionHumanWorkerRaceIsIdempotent: true,
    })
  );
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
