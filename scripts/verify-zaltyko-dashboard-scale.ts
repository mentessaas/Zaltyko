import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { Pool } from "pg";

import { withCronSystemActor } from "@/lib/cron-system-actor";
import { buildRetentionCohortProjections } from "@/modules/analytics/application/build-retention-cohort-projections";
import type { SystemActor } from "@/modules/shared/application/actor";
import { getOwnerDashboard } from "@/modules/owner-dashboard/application/get-owner-dashboard";
import { getOwnerDashboardFilterOptions } from "@/modules/owner-dashboard/application/dashboard-filter-options";
import { getCapacityHeatmap } from "@/modules/owner-dashboard/application/capacity-heatmap";
import { getRetentionCohorts } from "@/modules/owner-dashboard/application/retention-cohorts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
const pool = new Pool({ connectionString: databaseUrl, max: 60 });
const organizationId = "50000000-0000-4000-8000-000000000001";
process.env.CRON_SECRET = "synthetic-worker-secret";

async function asSyntheticCron<T>(
  job: (actor: SystemActor) => Promise<T>
): Promise<T> {
  const result = await withCronSystemActor(
    new Request("http://localhost/api/cron/zaltyko-outbox", {
      headers: { authorization: "Bearer synthetic-worker-secret" },
    }),
    job
  );
  if (!result.ok) throw new Error("La autenticación cron sintética fue denegada");
  return result.value;
}

function percentile(values: number[], rank: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * rank) - 1] ?? 0;
}

async function assertScaleFixture(): Promise<void> {
  const counts = await pool.query(
    `select
       (select count(*) from zaltyko.organization_members where organization_id = $1)::int as identities,
       (select count(*) from zaltyko.locations where organization_id = $1)::int as locations,
       (select count(*) from zaltyko.athletes where organization_id = $1)::int as athletes,
       (select count(*) from zaltyko.group_memberships where organization_id = $1)::int as group_memberships,
       (select count(*) from zaltyko.class_templates where organization_id = $1)::int as classes,
       (select count(*) from zaltyko.sessions where organization_id = $1)::int as sessions,
       (select count(*) from zaltyko.attendance_records where organization_id = $1)::int as attendance,
       (select count(*) from zaltyko.charges where organization_id = $1)::int as charges,
       (select count(*) from zaltyko.payments where organization_id = $1)::int as payments,
       (select count(*) from zaltyko.health_score_snapshots where organization_id = $1)::int as snapshots`,
    [organizationId]
  );
  assert.deepEqual(
    Object.values(counts.rows[0]),
    [20, 10, 5000, 5000, 1000, 100000, 2000000, 250000, 250000, 36]
  );
}

async function main(): Promise<void> {
  await assertScaleFixture();
  const latestMetricRun = await pool.query(
    `select id from zaltyko.metric_runs
     where organization_id = $1 and idempotency_key like 'scale-metric-run-%'
     order by source_watermark desc, created_at desc limit 1`,
    [organizationId]
  );
  assert.equal(latestMetricRun.rowCount, 1);
  const projectionBuild = await asSyntheticCron((actor) =>
    buildRetentionCohortProjections({
      organizationId,
      metricRunId: String(latestMetricRun.rows[0].id),
      actor,
    })
  );
  assert.equal(projectionBuild.projectionRuns, 11);
  assert(projectionBuild.projectionRows > 0);
  const identityResult = await pool.query(
    `select user_id from zaltyko.organization_members
     where organization_id = $1 and status = 'active' order by user_id limit 20`,
    [organizationId]
  );
  const userIds = identityResult.rows.map((row) => String(row.user_id));
  assert.equal(userIds.length, 20);

  async function oneOwnerRequest(userId: string) {
    const common = { userId, organizationId };
    const dashboardStarted = performance.now();
    const bundle = await getOwnerDashboard(common);
    const dashboardMs = performance.now() - dashboardStarted;
    assert.equal(bundle.scope.canViewOrganizationAggregate, true);
    assert.equal(bundle.score?.status, "healthy");
    assert.equal(bundle.availablePeriods.length, 12);

    const [capacityResult, cohortResult] = await Promise.all([
      (async () => {
        const started = performance.now();
        const result = await getCapacityHeatmap({ ...common, limit: 50 });
        return { result, elapsed: performance.now() - started };
      })(),
      (async () => {
        const started = performance.now();
        const result = await getRetentionCohorts({
          ...common,
          from: "2023-10-01",
          to: "2026-09-30",
          asOf: "2026-09-30",
          limit: 24,
        });
        return { result, elapsed: performance.now() - started };
      })(),
    ]);
    const filterStarted = performance.now();
    const filters = await getOwnerDashboardFilterOptions(common);
    const filtersMs = performance.now() - filterStarted;
    assert(capacityResult.result.cells.length > 0);
    assert.equal(cohortResult.result.items.length, 1);
    assert.equal(cohortResult.result.items[0].matrix.length, 36);
    assert.equal(filters.programs.length, 10);
    assert.equal(filters.groups.length, 250);
    assert.equal(
      JSON.stringify({ bundle, capacityResult, cohortResult, filters }).includes(
        "Atleta Sintético"
      ),
      false
    );
    return {
      dashboardMs,
      capacityMs: capacityResult.elapsed,
      cohortsMs: cohortResult.elapsed,
      filtersMs,
    };
  }

  // Prime local Postgres buffers, then measure 20 simultaneous identities.
  await oneOwnerRequest(userIds[0]);
  const concurrentResults = await Promise.all(userIds.map(oneOwnerRequest));
  const dashboardP95Ms = percentile(
    concurrentResults.map((result) => result.dashboardMs),
    0.95
  );
  const capacityP95Ms = percentile(
    concurrentResults.map((result) => result.capacityMs),
    0.95
  );
  const cohortsP95Ms = percentile(
    concurrentResults.map((result) => result.cohortsMs),
    0.95
  );
  const filtersP95Ms = percentile(
    concurrentResults.map((result) => result.filtersMs),
    0.95
  );
  const totalP95Ms = percentile(
    concurrentResults.map((result) =>
      Math.max(
        result.dashboardMs,
        result.capacityMs + result.cohortsMs,
        result.filtersMs
      )
    ),
    0.95
  );
  const database = await pool.query(
    `select current_setting('server_version') as postgres_version,
       pg_size_pretty(pg_database_size(current_database())) as database_size`
  );

  const withinBudget = dashboardP95Ms <= 800
    && capacityP95Ms <= 800
    && cohortsP95Ms <= 800
    && filtersP95Ms <= 800
    && totalP95Ms <= 2_000;
  console.log(
    JSON.stringify({
      status: withinBudget ? "PASS" : "FAIL",
      workload: {
        identities: 20,
        locations: 10,
        athletes: 5000,
        groups: 250,
        classes: 1000,
        sessions: 100000,
        attendanceRows: 2000000,
        charges: 250000,
        payments: 250000,
        healthScoreSnapshots: 36,
      },
      p95Ms: {
        dashboardQuery: Number(dashboardP95Ms.toFixed(1)),
        capacity: Number(capacityP95Ms.toFixed(1)),
        cohorts: Number(cohortsP95Ms.toFixed(1)),
        filters: Number(filtersP95Ms.toFixed(1)),
        composedViewServiceLayer: Number(totalP95Ms.toFixed(1)),
      },
      localDatabase: database.rows[0],
      scope: "service-layer benchmark; local PostgreSQL; no HTTP/Auth/browser measurement",
    })
  );

  assert(dashboardP95Ms <= 800, `dashboard query p95 ${dashboardP95Ms.toFixed(1)} ms > 800 ms`);
  assert(capacityP95Ms <= 800, `capacity query p95 ${capacityP95Ms.toFixed(1)} ms > 800 ms`);
  assert(cohortsP95Ms <= 800, `cohort query p95 ${cohortsP95Ms.toFixed(1)} ms > 800 ms`);
  assert(filtersP95Ms <= 800, `filter query p95 ${filtersP95Ms.toFixed(1)} ms > 800 ms`);
  assert(totalP95Ms <= 2_000, `composed view service p95 ${totalP95Ms.toFixed(1)} ms > 2000 ms`);

}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
