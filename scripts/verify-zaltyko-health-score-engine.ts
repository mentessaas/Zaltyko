import assert from "node:assert/strict";

import { Pool } from "pg";

import { withCronSystemActor } from "@/lib/cron-system-actor";
import { calculateAcademyHealthScore } from "@/modules/health-score/application/health-score-service";
import type { SystemActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
process.env.CRON_SECRET = "synthetic-worker-secret";

const ID = {
  org: "30000000-0000-0000-0000-000000000001",
  ownerUser: "30000000-0000-0000-0000-000000000101",
  ownerMember: "30000000-0000-0000-0000-000000000201",
  profile: "30000000-0000-0000-0000-000000000961",
  foreignUser: "20000000-0000-0000-0000-000000000101",
  foreignMember: "20000000-0000-0000-0000-000000000201",
};
const owner = { userId: ID.ownerUser, memberId: ID.ownerMember };

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

async function main(): Promise<void> {
  const runs = await pool.query(
    `select id, idempotency_key from zaltyko.metric_runs
     where organization_id = $1 and idempotency_key in ('metric-golden-run-001', 'metric-golden-run-002')`,
    [ID.org]
  );
  const runByKey = new Map(
    runs.rows.map((row) => [row.idempotency_key, String(row.id)])
  );
  const metricRunId = String(runByKey.get("metric-golden-run-002"));
  const earlierMetricRunId = String(runByKey.get("metric-golden-run-001"));

  await expectOperationalError(
    () =>
      calculateAcademyHealthScore({
        organizationId: ID.org,
        metricRunId,
        benchmarkProfileId: ID.profile,
        idempotencyKey: "score-foreign-owner-denied",
        actor: { userId: ID.foreignUser, memberId: ID.foreignMember },
      }),
    "FORBIDDEN"
  );

  const command = {
    organizationId: ID.org,
    metricRunId,
    benchmarkProfileId: ID.profile,
    idempotencyKey: "score-golden-001",
    actor: owner,
  };
  const first = await calculateAcademyHealthScore(command);
  const retry = await calculateAcademyHealthScore(command);
  assert.equal(retry.id, first.id);
  assert.equal(first.status, "healthy");
  assert.equal(Number(first.coverage), 0.85);
  assert(Math.abs(Number(first.score) - 83.28) < 0.01);
  assert.equal(
    await count("zaltyko.health_score_snapshots", `id = '${first.id}'`),
    1
  );
  assert.equal(
    await count(
      "zaltyko.health_score_dimension_snapshots",
      `health_score_snapshot_id = '${first.id}'`
    ),
    4
  );
  assert.equal(
    await count(
      "zaltyko.health_score_metric_contributions",
      `health_score_snapshot_id = '${first.id}'`
    ),
    5
  );
  const workforce = await pool.query(
    `select score, status from zaltyko.health_score_dimension_snapshots
     where health_score_snapshot_id = $1 and dimension = 'workforce'`,
    [first.id]
  );
  assert.equal(workforce.rows[0].score, null);
  assert.equal(workforce.rows[0].status, "insufficient_data");

  await asSyntheticCron(async (systemActor) => {
    const systemScore = await calculateAcademyHealthScore({
      organizationId: ID.org,
      metricRunId,
      benchmarkProfileId: ID.profile,
      idempotencyKey: "score-system-actor-001",
      actor: systemActor,
    });
    const systemAudit = await pool.query(
      `select actor_user_id, metadata from zaltyko.audit_log
       where organization_id = $1 and idempotency_key = $2`,
      [ID.org, "score-system-actor-001"]
    );
    assert.equal(systemScore.status, "healthy");
    assert.equal(systemAudit.rows[0].actor_user_id, null);
    assert.equal(systemAudit.rows[0].metadata.actor_type, "system");
    assert.equal(systemAudit.rows[0].metadata.job_key, "zaltyko-outbox");
  });

  await expectOperationalError(
    () =>
      calculateAcademyHealthScore({
        ...command,
        metricRunId: earlierMetricRunId,
      }),
    "IDEMPOTENCY_CONFLICT"
  );

  const second = await calculateAcademyHealthScore({
    ...command,
    idempotencyKey: "score-golden-002",
  });
  assert.equal(second.score, first.score);
  assert.equal(second.status, first.status);
  assert.equal(second.coverage, first.coverage);

  const insufficientRun = await pool.query(
    `insert into zaltyko.metric_runs (
       organization_id, authorization_location_id, period_start, period_end,
       currency, formula_set_version, status, parameters, source_watermark,
       idempotency_key, completed_at
     ) select organization_id, authorization_location_id, period_start, period_end,
       currency, formula_set_version, 'succeeded', parameters, source_watermark,
       'metric-score-insufficient', now()
     from zaltyko.metric_runs where id = $1 returning id`,
    [metricRunId]
  );
  const insufficientRunId = String(insufficientRun.rows[0].id);
  await pool.query(
    `insert into zaltyko.metric_run_values (
       organization_id, metric_run_id, location_id, metric_key, period_start,
       period_end, value_numeric, currency, numerator, denominator, coverage,
       quality, dimensions, dimensions_sha256, formula_version, computed_at,
       source_watermark, diagnostics
     ) select organization_id, $1, location_id, metric_key, period_start,
       period_end,
       case when metric_key = 'class_fill_rate' then null else value_numeric end,
       currency, numerator, denominator,
       case when metric_key = 'class_fill_rate' then 0 else coverage end,
       case when metric_key = 'class_fill_rate' then 'invalid'::zaltyko.metric_quality else quality end,
       dimensions, dimensions_sha256, formula_version, computed_at,
       source_watermark, diagnostics
     from zaltyko.metric_run_values where metric_run_id = $2`,
    [insufficientRunId, metricRunId]
  );
  const insufficient = await calculateAcademyHealthScore({
    ...command,
    metricRunId: insufficientRunId,
    idempotencyKey: "score-insufficient-001",
  });
  assert.equal(insufficient.score, null);
  assert.equal(insufficient.status, "insufficient_data");
  const enrollment = await pool.query(
    `select score, status, available_metric_weight::float8 as available
     from zaltyko.health_score_dimension_snapshots
     where health_score_snapshot_id = $1 and dimension = 'enrollment'`,
    [insufficient.id]
  );
  assert.equal(enrollment.rows[0].score, null);
  assert.equal(enrollment.rows[0].status, "insufficient_data");
  assert.equal(enrollment.rows[0].available, 0.55);

  const unsafe = await count(
    "zaltyko.health_score_metric_contributions",
    `explanation::text ~* '\"(email|phone|name|address|medical|secret|token)\"'`
  );
  assert.equal(unsafe, 0);

  console.log(
    JSON.stringify({
      status: "PASS",
      score: first.score,
      band: first.status,
      coverage: first.coverage,
      dimensions: 4,
      contributions: 5,
      recomputeStable: second.score === first.score,
      insufficientEnrollment: enrollment.rows[0].status,
    })
  );
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
