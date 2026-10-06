import assert from "node:assert/strict";

import { Pool } from "pg";

import { withCronSystemActor } from "@/lib/cron-system-actor";
import { dispatchOutboxBatch } from "@/modules/analytics/application/outbox-dispatcher";
import { processMetricInvalidation } from "@/modules/analytics/application/process-metric-invalidation";
import { saveAcademyTargetProfile } from "@/modules/health-score/application/academy-target-profile";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
process.env.CRON_SECRET = "synthetic-worker-secret";
const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const organizationId = "10000000-0000-0000-0000-000000000001";
const locationId = "10000000-0000-0000-0000-000000000011";
const owner = {
  userId: "10000000-0000-0000-0000-000000000101",
  memberId: "10000000-0000-0000-0000-000000000201",
};
const syntheticTargets = {
  class_fill_rate: 0.75,
  cohort_retention_rate: 0.8,
  churn_rate: 0.05,
  collection_rate: 0.95,
  attendance_coverage: 0.95,
};

async function main() {
  await pool.query(
    `update zaltyko.outbox_events set status = 'processed', processed_at = now()
     where status = 'pending'`
  );
  const event = await pool.query(
    `insert into zaltyko.outbox_events (
       organization_id, location_id, event_name, aggregate_type, aggregate_id,
       idempotency_key, payload, occurred_at
     ) values ($1, $2, 'organization.bootstrapped', 'organization', $1,
       'worker-pipeline-synthetic-event', '{}', now())
     returning id`,
    [organizationId, locationId]
  );
  const outboxEventId = String(event.rows[0].id);
  const dispatched = await withCronSystemActor(
    new Request("http://localhost/api/cron/zaltyko-outbox", {
      headers: { authorization: "Bearer synthetic-worker-secret" },
    }),
    (actor) => dispatchOutboxBatch({ actor, batchSize: 1 })
  );
  assert.equal(dispatched.ok, true);
  if (!dispatched.ok) throw new Error("Dispatcher rechazó evento");
  assert.equal(dispatched.value.processed, 1);
  assert.equal(dispatched.value.metricRuns, 2);
  assert.equal(dispatched.value.scoreSkipped, 1);
  assert.equal(dispatched.value.insightEvaluations, 1);

  const pipelineResult = await withCronSystemActor(
    new Request("http://localhost/api/cron/zaltyko-outbox", {
      headers: { authorization: "Bearer synthetic-worker-secret" },
    }),
    (actor) =>
      processMetricInvalidation({ organizationId, outboxEventId, actor })
  );
  assert.equal(pipelineResult.ok, true);
  if (!pipelineResult.ok || !pipelineResult.value)
    throw new Error("No se pudo consultar el resultado idempotente");
  assert.equal(pipelineResult.value.scoreSkippedReason, "benchmark_missing");
  assert.equal(pipelineResult.value.scoreSnapshotId, null);
  const metricRunId = pipelineResult.value.metricRunId;
  await pool.query(
    `update zaltyko.outbox_events set status = 'processed', processed_at = now()
     where status = 'pending'`
  );

  const targetCommand = {
    organizationId,
    authorizationLocationId: locationId,
    actor: owner,
    targets: syntheticTargets,
    idempotencyKey: "academy-internal-targets-synthetic-001",
  };
  const profile = await saveAcademyTargetProfile(targetCommand);
  assert.equal(profile.replayed, false);
  assert.equal((await saveAcademyTargetProfile(targetCommand)).replayed, true);
  await assert.rejects(
    saveAcademyTargetProfile({
      ...targetCommand,
      targets: { ...syntheticTargets, class_fill_rate: 0.8 },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "IDEMPOTENCY_CONFLICT");
      return true;
    }
  );
  await assert.rejects(
    saveAcademyTargetProfile({
      ...targetCommand,
      actor: {
        userId: "20000000-0000-0000-0000-000000000102",
        memberId: "20000000-0000-0000-0000-000000000202",
      },
      idempotencyKey: "cross-tenant-targets-denied",
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "FORBIDDEN");
      return true;
    }
  );
  const configuredPipeline = await withCronSystemActor(
    new Request("http://localhost/api/cron/zaltyko-outbox", {
      headers: { authorization: "Bearer synthetic-worker-secret" },
    }),
    (actor) => dispatchOutboxBatch({ actor, batchSize: 1 })
  );
  assert.equal(configuredPipeline.ok, true);
  if (!configuredPipeline.ok)
    throw new Error("No se pudo procesar la configuración de objetivos");
  assert.equal(configuredPipeline.value.scoreSnapshots, 1);
  assert.equal(configuredPipeline.value.scoreSkipped, 0);
  assert.equal(
    await pool
      .query(
        `select count(*)::int as count from zaltyko.audit_log
         where organization_id = $1 and action = 'health_score.internal_targets_configured'
           and actor_user_id = $2`,
        [organizationId, owner.userId]
      )
      .then((rows) => Number(rows.rows[0].count)),
    1
  );

  const metricRun = await pool.query(
    `select id, status from zaltyko.metric_runs
     where id = $1 and organization_id = $2`,
    [metricRunId, organizationId]
  );
  assert.equal(metricRun.rows[0]?.status, "succeeded");
  assert.equal(
    await pool
      .query(
        `select count(*)::int as count from zaltyko.health_score_snapshots
       where organization_id = $1`,
        [organizationId]
      )
      .then((rows) => Number(rows.rows[0].count)),
    1
  );
  assert.equal(
    await pool
      .query(
        `select count(*)::int as count from zaltyko.audit_log
       where organization_id = $1 and action = 'health_score.skipped'
         and after->>'reason' = 'benchmark_missing'`,
        [organizationId]
      )
      .then((rows) => Number(rows.rows[0].count)),
    1
  );
  assert.equal(
    await pool
      .query(
        `select count(*)::int as count from zaltyko.audit_log
       where organization_id = $1 and action = 'insights.evaluated'
         and actor_user_id is null and metadata->>'job_key' = 'zaltyko-outbox'`,
        [organizationId]
      )
      .then((rows) => Number(rows.rows[0].count)),
    18
  );

  const retry = await withCronSystemActor(
    new Request("http://localhost/api/cron/zaltyko-outbox", {
      headers: { authorization: "Bearer synthetic-worker-secret" },
    }),
    (actor) =>
      processMetricInvalidation({ organizationId, outboxEventId, actor })
  );
  assert.equal(retry.ok, true);
  if (!retry.ok || !retry.value)
    throw new Error("Reintento del pipeline falló");
  assert.equal(retry.value.metricRunId, metricRunId);
  assert.equal(retry.value.scoreSkippedReason, null);
  assert.ok(retry.value.scoreSnapshotId);

  await assert.rejects(
    processMetricInvalidation({
      organizationId,
      outboxEventId,
      actor: {
        type: "system",
        jobKey: "zaltyko-outbox",
        correlationId: "30000000-0000-0000-0000-000000000991",
      },
    })
  );

  console.log(
    JSON.stringify({
      status: "PASS",
      invalidation: "idempotent",
      metrics: "recomputed",
      missingBenchmark: "score_skipped_without_global_or_fixture_profile",
      p0RulesEvaluated: 9,
      systemActorForgeryDenied: true,
      remoteServicesUsed: false,
    })
  );
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
