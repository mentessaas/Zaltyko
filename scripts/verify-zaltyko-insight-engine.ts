import assert from "node:assert/strict";

import { Pool } from "pg";

import {
  changeInsightDisposition,
  completeInsightAction,
  recordInsightAction,
  runInsightEvaluation,
} from "@/modules/insights/application/insight-service";
import { listInsights } from "@/modules/insights/application/insight-query";
import { evaluateExcessDemand } from "@/modules/insights/domain/insight-rules";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

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
        beforeValue: { fillRate: 0.92, eligibleWaitlist: 3 },
        evaluationWindowDays: 30,
        idempotencyKey: "insight-action-stale-version",
        actor: owner,
      }),
    "VERSION_CONFLICT"
  );

  insightA = await loadInsight(ID.classA);
  const action = await recordInsightAction({
    organizationId: ID.org,
    authorizationLocationId: ID.north,
    insightId: insightA.id,
    expectedVersion: insightA.version,
    actionKey: "simulate_group",
    targetEntityType: "class_template",
    targetEntityId: ID.classA,
    beforeValue: { fillRate: 0.92, eligibleWaitlist: 3 },
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
    beforeValue: { fillRate: 0.92, eligibleWaitlist: 3 },
    evaluationWindowDays: 30,
    idempotencyKey: "insight-action-001",
    actor: owner,
  });
  assert.equal(actionRetry.id, action.id);
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
    })
  );
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
