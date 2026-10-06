import assert from "node:assert/strict";

import { Pool } from "pg";

import {
  recomputeMetrics,
} from "@/modules/analytics/application/metric-engine";
import { dispatchOutboxBatch } from "@/modules/analytics/application/outbox-dispatcher";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

const ID = {
  org: "30000000-0000-0000-0000-000000000001",
  location: "30000000-0000-0000-0000-000000000011",
  ownerUser: "30000000-0000-0000-0000-000000000101",
  ownerMember: "30000000-0000-0000-0000-000000000201",
  managerOrg: "20000000-0000-0000-0000-000000000001",
  managerLocation: "20000000-0000-0000-0000-000000000011",
  managerUser: "20000000-0000-0000-0000-000000000102",
  managerMember: "20000000-0000-0000-0000-000000000202",
  sparseOrg: "10000000-0000-0000-0000-000000000001",
  sparseLocation: "10000000-0000-0000-0000-000000000011",
  sparseOwnerUser: "10000000-0000-0000-0000-000000000101",
  sparseOwnerMember: "10000000-0000-0000-0000-000000000201",
};

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

async function values(): Promise<
  Record<
    string,
    {
      value: number | null;
      numerator: number | null;
      denominator: number | null;
      quality: string;
    }
  >
> {
  const result = await pool.query(
    `
    select metric_key, value_numeric::float8 as value, numerator::float8 as numerator,
           denominator::float8 as denominator, quality
    from zaltyko.metric_values
    where organization_id = $1
  `,
    [ID.org]
  );
  return Object.fromEntries(result.rows.map((row) => [row.metric_key, row]));
}

async function main(): Promise<void> {
  await expectOperationalError(
    () =>
      recomputeMetrics({
        organizationId: ID.managerOrg,
        authorizationLocationId: ID.managerLocation,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        currency: "EUR",
        sourceWatermark: "2026-09-30T23:59:00+02:00",
        idempotencyKey: "metric-manager-denied",
        actor: { userId: ID.managerUser, memberId: ID.managerMember },
      }),
    "FORBIDDEN"
  );

  const command = {
    organizationId: ID.org,
    authorizationLocationId: ID.location,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    currency: "EUR" as const,
    sourceWatermark: "2026-09-30T23:59:00+02:00",
    idempotencyKey: "metric-golden-run-001",
    actor: { userId: ID.ownerUser, memberId: ID.ownerMember },
  };
  const first = await recomputeMetrics(command);
  const retry = await recomputeMetrics(command);
  assert.equal(first.status, "succeeded");
  assert.equal(retry.id, first.id);
  assert.equal(
    await count("zaltyko.metric_runs", `organization_id = '${ID.org}'`),
    1
  );
  assert.equal(
    await count("zaltyko.metric_values", `organization_id = '${ID.org}'`),
    12
  );
  assert.equal(
    await count("zaltyko.metric_run_values", `organization_id = '${ID.org}'`),
    12
  );

  const metric = await values();
  assert.equal(metric.active_athletes_count.value, 84);
  assert.equal(metric.class_fill_rate.numerator, 85);
  assert.equal(metric.class_fill_rate.denominator, 110);
  assert(Math.abs(Number(metric.class_fill_rate.value) - 85 / 110) < 1e-8);
  assert.equal(metric.attendance_rate.numerator, 74);
  assert.equal(metric.attendance_rate.denominator, 85);
  assert.equal(metric.attendance_coverage.value, 1);
  assert.equal(metric.cohort_retention_rate.numerator, 84);
  assert.equal(metric.cohort_retention_rate.denominator, 85);
  assert.equal(metric.churn_rate.numerator, 1);
  assert.equal(metric.churn_rate.denominator, 85);
  assert.equal(metric.recognized_revenue_minor.value, 10000);
  assert.equal(metric.net_collected_minor.value, 5000);
  assert.equal(metric.outstanding_minor.value, 4000);
  assert.equal(metric.collection_rate.value, 0.5);
  assert.equal(metric.waitlist_opportunity_count.value, 3);

  const outbox = await pool.query(
    `insert into zaltyko.outbox_events (
       organization_id, location_id, event_name, aggregate_type, aggregate_id,
       idempotency_key, payload, occurred_at
     ) values ($1, $2, 'attendance.corrected', 'attendance', gen_random_uuid(),
       'metric-invalidation-source', '{}', '2026-09-20 10:00:00+02')
     returning id`,
    [ID.org, ID.location]
  );
  const outboxEventId = String(outbox.rows[0].id);
  const dispatched = await Promise.all([
    dispatchOutboxBatch({ batchSize: 1 }),
    dispatchOutboxBatch({ batchSize: 1 }),
    dispatchOutboxBatch({ batchSize: 1 }),
  ]);
  assert.equal(dispatched.reduce((sum, result) => sum + result.claimed, 0), 1);
  assert.equal(dispatched.reduce((sum, result) => sum + result.processed, 0), 1);
  assert.equal(
    await count("zaltyko.outbox_events", `id = '${outboxEventId}' and status = 'processed'`),
    1
  );
  assert.equal(
    await count(
      "zaltyko.metric_invalidations",
      `outbox_event_id = '${outboxEventId}'`
    ),
    1
  );

  const expiredLease = await pool.query(
    `insert into zaltyko.outbox_events (
       organization_id, location_id, event_name, aggregate_type, aggregate_id,
       idempotency_key, payload, status, attempts, available_at, occurred_at
     ) values ($1, $2, 'attendance.corrected', 'attendance', gen_random_uuid(),
       'metric-invalidation-expired-lease', '{}', 'processing', 1, now() - interval '1 minute', now())
     returning id`,
    [ID.org, ID.location]
  );
  const recoveredId = String(expiredLease.rows[0].id);
  const recovered = await dispatchOutboxBatch({ batchSize: 1 });
  assert.equal(recovered.claimed, 1);
  assert.equal(recovered.processed, 1);
  assert.equal(
    await count("zaltyko.outbox_events", `id = '${recoveredId}' and status = 'processed' and attempts = 2`),
    1
  );
  const exhaustedLease = await pool.query(
    `insert into zaltyko.outbox_events (
       organization_id, location_id, event_name, aggregate_type, aggregate_id,
       idempotency_key, payload, status, attempts, available_at, occurred_at
     ) values ($1, $2, 'attendance.corrected', 'attendance', gen_random_uuid(),
       'metric-invalidation-exhausted-lease', '{}', 'processing', 8, now() - interval '1 minute', now())
     returning id`,
    [ID.org, ID.location]
  );
  const exhaustedId = String(exhaustedLease.rows[0].id);
  const exhausted = await dispatchOutboxBatch({ batchSize: 1 });
  assert.equal(exhausted.claimed, 0);
  assert.equal(exhausted.deadLettered, 1);
  assert.equal(
    await count("zaltyko.outbox_events", `id = '${exhaustedId}' and status = 'failed' and last_error = 'MAX_ATTEMPTS_EXHAUSTED'`),
    1
  );

  const second = await recomputeMetrics({
    ...command,
    idempotencyKey: "metric-golden-run-002",
  });
  assert.equal(second.status, "succeeded");
  assert.equal(
    await count(
      "zaltyko.metric_invalidations",
      `outbox_event_id = '${outboxEventId}' and status = 'processed'`
    ),
    1
  );
  assert.equal(
    await count("zaltyko.metric_runs", `organization_id = '${ID.org}'`),
    2
  );
  assert.equal(
    await count("zaltyko.metric_values", `organization_id = '${ID.org}'`),
    12
  );
  assert.equal(
    await count("zaltyko.metric_run_values", `organization_id = '${ID.org}'`),
    24
  );
  const recomputed = await values();
  for (const key of Object.keys(metric))
    assert.deepEqual(recomputed[key], metric[key]);

  assert.equal(
    await count("zaltyko.audit_log", "action = 'metrics.recomputed'"),
    2
  );
  assert.equal(
    await count("zaltyko.data_quality_issues", `organization_id = '${ID.org}'`),
    0
  );

  const today = new Date().toISOString().slice(0, 10);
  await recomputeMetrics({
    organizationId: ID.sparseOrg,
    authorizationLocationId: ID.sparseLocation,
    periodStart: today,
    periodEnd: today,
    currency: "EUR",
    sourceWatermark: new Date().toISOString(),
    idempotencyKey: "metric-sparse-run-001",
    actor: { userId: ID.sparseOwnerUser, memberId: ID.sparseOwnerMember },
  });
  const sparseAttendance = await pool.query(
    `select value_numeric, quality from zaltyko.metric_values
     where organization_id = $1 and metric_key = 'attendance_rate'`,
    [ID.sparseOrg]
  );
  assert.equal(sparseAttendance.rows[0].value_numeric, null);
  assert.equal(sparseAttendance.rows[0].quality, "insufficient");

  console.log(
    JSON.stringify({
      status: "PASS",
      metrics: Object.keys(metric).length,
      fillRate: metric.class_fill_rate.value,
      retention: metric.cohort_retention_rate.value,
      churn: metric.churn_rate.value,
      netCollected: metric.net_collected_minor.value,
      currentValues: await count(
        "zaltyko.metric_values",
        `organization_id = '${ID.org}'`
      ),
      immutableRunValues: await count(
        "zaltyko.metric_run_values",
        `organization_id = '${ID.org}'`
      ),
      outboxWorkersProcessed: 2,
      concurrentOutboxClaims: true,
      expiredLeaseRecovered: true,
      exhaustedLeaseDeadLettered: true,
    })
  );
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
