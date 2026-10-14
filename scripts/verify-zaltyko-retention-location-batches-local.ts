import assert from "node:assert/strict";

import { Pool } from "pg";

import { withCronSystemActor } from "@/lib/cron-system-actor";
import {
  getSnapshotLocationIds,
  loadActiveLocationSnapshot,
} from "@/modules/analytics/application/active-location-snapshot";
import { buildRetentionCohortProjections } from "@/modules/analytics/application/build-retention-cohort-projections";
import type { SystemActor } from "@/modules/shared/application/actor";

const LOCAL_ONLY = "ZALTYKO_MONTHLY_BILLING_PAGING_LOCAL";
const ORGANIZATION_ID = "50000000-0000-4000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "50000000-0000-4000-8000-000000000002";
const INACTIVE_LOCATION_ID = "50000000-0000-4000-8000-000000000003";
const OTHER_LOCATION_ID = "50000000-0000-4000-8000-000000000004";
const METRIC_RUN_ID = "50000000-0000-4000-8000-000000000005";
const OTHER_METRIC_RUN_ID = "50000000-0000-4000-8000-000000000006";
const ACTIVE_LOCATION_COUNT = 501;
const PROJECTION_RUN_COUNT = ACTIVE_LOCATION_COUNT + 1;
const OBSERVATION_MONTHS = ["2026-09-01", "2026-10-01"];
const EXPECTED_PROJECTION_ROWS =
  PROJECTION_RUN_COUNT * OBSERVATION_MONTHS.length;
const STATEMENT_TIMEOUT_MS = 8_000;
const LOCK_TIMEOUT_MS = 4_000;

function assertLocalDatabaseUrl(name: string): string {
  const value = process.env[name];
  assert(value, `${name} is required`);
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "postgresql:");
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.pathname, "/postgres");
  assert.equal(parsed.password, "");
  assert.equal(parsed.port, process.env.ZALTYKO_MONTHLY_BILLING_PAGING_PORT);
  assert.equal(
    parsed.searchParams.get("statement_timeout"),
    String(STATEMENT_TIMEOUT_MS)
  );
  assert.equal(
    parsed.searchParams.get("lock_timeout"),
    String(LOCK_TIMEOUT_MS)
  );
  return value;
}

async function seed(pool: Pool): Promise<void> {
  await pool.query(`
    insert into zaltyko.organizations (id, name, status)
    values
      ('${ORGANIZATION_ID}'::uuid, 'Synthetic retention academy', 'active'),
      ('${OTHER_ORGANIZATION_ID}'::uuid, 'Synthetic foreign academy', 'active');

    insert into zaltyko.locations (id, organization_id, code, name, timezone)
    select
      ('51000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}'::uuid,
      'retention-' || n,
      'Synthetic location ' || n,
      'Europe/Madrid'
    from generate_series(1, ${ACTIVE_LOCATION_COUNT}) as n
    union all
    select '${INACTIVE_LOCATION_ID}'::uuid, '${ORGANIZATION_ID}'::uuid,
      'retention-inactive', 'Synthetic inactive location', 'Europe/Madrid'
    union all
    select '${OTHER_LOCATION_ID}'::uuid, '${OTHER_ORGANIZATION_ID}'::uuid,
      'retention-foreign', 'Synthetic foreign location', 'Europe/Madrid';

    update zaltyko.locations
    set is_active = false
    where id = '${INACTIVE_LOCATION_ID}'::uuid;

    insert into zaltyko.people (id, organization_id, given_name, family_name)
    select
      ('52000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}'::uuid,
      'Synthetic',
      'Athlete ' || n
    from generate_series(1, ${ACTIVE_LOCATION_COUNT}) as n;

    insert into zaltyko.athletes (id, organization_id, person_id)
    select
      ('53000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}'::uuid,
      ('52000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
    from generate_series(1, ${ACTIVE_LOCATION_COUNT}) as n;

    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    )
    select
      ('54000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}'::uuid,
      ('51000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'Synthetic class ' || n,
      20,
      'active'::zaltyko.lifecycle_status,
      date '2026-09-01'
    from generate_series(1, ${ACTIVE_LOCATION_COUNT}) as n;

    insert into zaltyko.enrollments (
      id, organization_id, location_id, athlete_id, class_template_id,
      status, starts_on, ends_on, source
    )
    select
      ('55000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}'::uuid,
      ('51000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('53000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('54000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'active'::zaltyko.enrollment_status,
      date '2026-09-01',
      null::date,
      'owner'::zaltyko.enrollment_source
    from generate_series(1, ${ACTIVE_LOCATION_COUNT}) as n;

    insert into zaltyko.enrollment_status_history (
      organization_id, enrollment_id, to_status, effective_on, idempotency_key
    )
    select
      '${ORGANIZATION_ID}'::uuid,
      ('55000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'active'::zaltyko.enrollment_status,
      date '2026-09-01',
      'retention-harness-active-' || n
    from generate_series(1, ${ACTIVE_LOCATION_COUNT}) as n;

    insert into zaltyko.metric_runs (
      id, organization_id, authorization_location_id,
      period_start, period_end, currency, formula_set_version, status,
      source_watermark, idempotency_key, completed_at
    ) values
      (
        '${METRIC_RUN_ID}'::uuid,
        '${ORGANIZATION_ID}'::uuid,
        '51000000-0000-4000-8000-000000000001'::uuid,
        date '2026-09-01', date '2026-10-14', 'EUR',
        'retention-harness-v1', 'succeeded'::zaltyko.metric_run_status,
        timestamptz '2026-10-14T12:00:00Z', 'retention-harness-main-run', now()
      ),
      (
        '${OTHER_METRIC_RUN_ID}'::uuid,
        '${OTHER_ORGANIZATION_ID}'::uuid,
        '${OTHER_LOCATION_ID}'::uuid,
        date '2026-09-01', date '2026-10-14', 'EUR',
        'retention-harness-v1', 'succeeded'::zaltyko.metric_run_status,
        timestamptz '2026-10-14T12:00:00Z', 'retention-harness-foreign-run', now()
      );
  `);
}

async function withSyntheticCron<T>(
  job: (actor: SystemActor) => Promise<T>
): Promise<T> {
  const result = await withCronSystemActor(
    new Request("http://localhost/api/cron/zaltyko-outbox", {
      headers: { authorization: "Bearer synthetic-retention-worker" },
    }),
    job
  );
  if (!result.ok) throw new Error("Synthetic cron authentication was denied");
  return result.value;
}

async function countHarnessRows(pool: Pool): Promise<{
  runs: number;
  projections: number;
}> {
  const result = await pool.query<{ runs: number; projections: number }>(
    `
    select
      (select count(*)::int from zaltyko.retention_cohort_projection_runs) as runs,
      (select count(*)::int from zaltyko.retention_cohort_projections) as projections
  `
  );
  return result.rows[0];
}

async function main(): Promise<void> {
  assert.equal(process.env[LOCAL_ONLY], "1");
  assert.equal(process.env.DOTENV_CONFIG_PATH, "/dev/null");
  const databaseUrl = assertLocalDatabaseUrl("DATABASE_URL");
  assertLocalDatabaseUrl("DATABASE_URL_POOL");
  assertLocalDatabaseUrl("DATABASE_URL_DIRECT");

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: 1_000,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    lock_timeout: LOCK_TIMEOUT_MS,
  });
  process.env.CRON_SECRET = "synthetic-retention-worker";

  try {
    await seed(pool);

    const expectedLocations = await pool.query<{ id: string }>(
      `
      select id::text as id
      from zaltyko.locations
      where organization_id = $1 and is_active
      order by id
    `,
      [ORGANIZATION_ID]
    );
    assert.equal(expectedLocations.rows.length, ACTIVE_LOCATION_COUNT);
    assert(
      !expectedLocations.rows.some((row) => row.id === INACTIVE_LOCATION_ID)
    );
    assert(!expectedLocations.rows.some((row) => row.id === OTHER_LOCATION_ID));
    const foreignMetricRun = await pool.query<{ count: number }>(
      `
      select count(*)::int as count
      from zaltyko.metric_runs
      where organization_id = $1 and id = $2 and status = 'succeeded'
    `,
      [OTHER_ORGANIZATION_ID, OTHER_METRIC_RUN_ID]
    );
    assert.equal(foreignMetricRun.rows[0]?.count, 1);

    const locationSnapshot = await loadActiveLocationSnapshot(ORGANIZATION_ID);
    const snapshotLocationIds = getSnapshotLocationIds(
      locationSnapshot,
      ORGANIZATION_ID
    );
    assert.deepEqual(
      snapshotLocationIds,
      expectedLocations.rows.map((row) => row.id)
    );
    assert.throws(
      () => getSnapshotLocationIds(locationSnapshot, OTHER_ORGANIZATION_ID),
      /Active location snapshot does not match organization/
    );

    const input = {
      organizationId: ORGANIZATION_ID,
      metricRunId: METRIC_RUN_ID,
    };
    const firstBuild = await withSyntheticCron((actor) =>
      buildRetentionCohortProjections({
        ...input,
        actor,
        locationSnapshot,
      })
    );
    assert.deepEqual(firstBuild, {
      projectionRuns: PROJECTION_RUN_COUNT,
      projectionRows: EXPECTED_PROJECTION_ROWS,
    });

    const runRows = await pool.query<{
      idempotency_key: string;
      location_id: string | null;
      status: string;
      row_count: number;
      projection_count: number;
      observation_months: number;
      cohort_size_min: number;
      cohort_size_max: number;
      active_count_min: number;
      active_count_max: number;
      retention_min: string | null;
      retention_max: string | null;
      all_complete: boolean;
    }>(
      `
      select
        run.idempotency_key,
        run.location_id::text as location_id,
        run.status,
        run.row_count,
        count(projection.id)::int as projection_count,
        count(distinct projection.observation_month)::int as observation_months,
        min(projection.cohort_size)::int as cohort_size_min,
        max(projection.cohort_size)::int as cohort_size_max,
        min(projection.active_count)::int as active_count_min,
        max(projection.active_count)::int as active_count_max,
        min(projection.retention_rate)::text as retention_min,
        max(projection.retention_rate)::text as retention_max,
        bool_and(projection.quality = 'complete'::zaltyko.metric_quality) as all_complete
      from zaltyko.retention_cohort_projection_runs run
      left join zaltyko.retention_cohort_projections projection
        on projection.organization_id = run.organization_id
       and projection.projection_run_id = run.id
      where run.organization_id = $1 and run.metric_run_id = $2
      group by run.id, run.idempotency_key, run.location_id, run.status, run.row_count
      order by run.idempotency_key
    `,
      [ORGANIZATION_ID, METRIC_RUN_ID]
    );

    assert.equal(runRows.rows.length, PROJECTION_RUN_COUNT);
    const expectedKeys = [
      `metric:${METRIC_RUN_ID}:scope:organization`,
      ...snapshotLocationIds.map(
        (locationId) => `metric:${METRIC_RUN_ID}:scope:location:${locationId}`
      ),
    ].sort();
    assert.deepEqual(
      runRows.rows.map((row) => row.idempotency_key),
      expectedKeys
    );
    assert(runRows.rows.every((row) => row.status === "succeeded"));
    assert(runRows.rows.every((row) => row.row_count === 2));
    assert(runRows.rows.every((row) => row.projection_count === 2));
    assert(runRows.rows.every((row) => row.observation_months === 2));
    assert(runRows.rows.every((row) => row.all_complete));
    assert(runRows.rows.every((row) => Number(row.retention_min) === 1));
    assert(runRows.rows.every((row) => Number(row.retention_max) === 1));
    assert.deepEqual(
      runRows.rows
        .filter((row) => row.location_id !== null)
        .map((row) => row.location_id)
        .sort(),
      [...snapshotLocationIds].sort()
    );
    const organizationRun = runRows.rows.find(
      (row) => row.location_id === null
    );
    assert(organizationRun);
    assert.equal(
      organizationRun.idempotency_key,
      `metric:${METRIC_RUN_ID}:scope:organization`
    );
    assert.equal(organizationRun.cohort_size_min, ACTIVE_LOCATION_COUNT);
    assert.equal(organizationRun.cohort_size_max, ACTIVE_LOCATION_COUNT);
    assert.equal(organizationRun.active_count_min, ACTIVE_LOCATION_COUNT);
    assert.equal(organizationRun.active_count_max, ACTIVE_LOCATION_COUNT);
    assert(
      runRows.rows
        .filter((row) => row.location_id !== null)
        .every(
          (row) =>
            row.cohort_size_min === 1 &&
            row.cohort_size_max === 1 &&
            row.active_count_min === 1 &&
            row.active_count_max === 1
        )
    );

    const monthRows = await pool.query<{
      observation_month: string;
      count: number;
    }>(
      `
      select projection.observation_month::text as observation_month,
        count(*)::int as count
      from zaltyko.retention_cohort_projections projection
      join zaltyko.retention_cohort_projection_runs run
        on run.organization_id = projection.organization_id
       and run.id = projection.projection_run_id
      where run.organization_id = $1 and run.metric_run_id = $2
      group by projection.observation_month
      order by projection.observation_month
    `,
      [ORGANIZATION_ID, METRIC_RUN_ID]
    );
    assert.deepEqual(
      monthRows.rows.map((row) => row.observation_month),
      OBSERVATION_MONTHS
    );
    assert(monthRows.rows.every((row) => row.count === PROJECTION_RUN_COUNT));

    const beforeForeignRun = await countHarnessRows(pool);
    await assert.rejects(
      withSyntheticCron((actor) =>
        buildRetentionCohortProjections({
          organizationId: ORGANIZATION_ID,
          metricRunId: OTHER_METRIC_RUN_ID,
          actor,
          locationSnapshot,
        })
      ),
      /Retention projection requires a successful metric run/
    );
    assert.deepEqual(await countHarnessRows(pool), beforeForeignRun);

    const beforeRetry = await countHarnessRows(pool);
    const retryBuild = await withSyntheticCron((actor) =>
      buildRetentionCohortProjections({
        ...input,
        actor,
        locationSnapshot,
      })
    );
    assert.deepEqual(retryBuild, {
      projectionRuns: PROJECTION_RUN_COUNT,
      projectionRows: 0,
    });
    assert.deepEqual(await countHarnessRows(pool), beforeRetry);

    const excludedScopeCount = await pool.query<{ count: number }>(
      `
      select count(*)::int as count
      from zaltyko.retention_cohort_projection_runs
      where (organization_id = $1 and location_id = $2)
         or (organization_id = $3 and location_id = $4)
    `,
      [
        ORGANIZATION_ID,
        INACTIVE_LOCATION_ID,
        OTHER_ORGANIZATION_ID,
        OTHER_LOCATION_ID,
      ]
    );
    assert.equal(excludedScopeCount.rows[0]?.count, 0);

    console.log(
      JSON.stringify({
        status: "PASS",
        service: "buildRetentionCohortProjections",
        activeLocations: ACTIVE_LOCATION_COUNT,
        projectionRuns: firstBuild.projectionRuns,
        projectionRows: firstBuild.projectionRows,
        batchBoundaries: [500, 2],
        locationSnapshotPages: [200, 200, 101],
        observationMonths: OBSERVATION_MONTHS,
        excludedScopes: 2,
        foreignMetricRun: "rejected without writes",
        idempotentRetry: "no new projection rows",
        database: "disposable PostgreSQL 17 loopback only",
      })
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
