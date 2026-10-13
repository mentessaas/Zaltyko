import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { Pool } from "pg";

import { getOwnerDashboard } from "@/modules/owner-dashboard/application/get-owner-dashboard";
import { getHealthScoreHistory } from "@/modules/owner-dashboard/application/health-score-history";
import { getMetricSeries } from "@/modules/owner-dashboard/application/metric-series";
import { getCapacityHeatmap } from "@/modules/owner-dashboard/application/capacity-heatmap";
import { getRetentionCohorts } from "@/modules/owner-dashboard/application/retention-cohorts";
import { getOwnerDashboardFilterOptions } from "@/modules/owner-dashboard/application/dashboard-filter-options";
import {
  DEFAULT_OWNER_DASHBOARD_ORDER,
  getOwnerDashboardLayout,
  saveOwnerDashboardLayout,
} from "@/modules/owner-dashboard/application/dashboard-layout";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

const ID = {
  org: "30000000-0000-0000-0000-000000000001",
  location: "30000000-0000-0000-0000-000000000011",
  ownerUser: "30000000-0000-0000-0000-000000000101",
  foreignOwnerUser: "20000000-0000-0000-0000-000000000101",
  scopedManagerUser: "20000000-0000-0000-0000-000000000102",
  managerOrg: "20000000-0000-0000-0000-000000000001",
  managerNorth: "20000000-0000-0000-0000-000000000011",
  managerSouth: "20000000-0000-0000-0000-000000000012",
  managerProgram: "20000000-0000-0000-0000-000000000701",
  managerNorthGroup: "20000000-0000-0000-0000-000000000798",
  managerSouthGroup: "20000000-0000-0000-0000-000000000797",
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

function percentile(values: number[], rank: number): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * rank) - 1] ?? 0;
}

async function main(): Promise<void> {
  // The preceding health-score harness intentionally leaves retry/dead-letter
  // events in this disposable database. Normalize only those synthetic fixture
  // organizations so freshness assertions start from a known baseline.
  await pool.query(
    `update zaltyko.outbox_events
     set status = 'processed', processed_at = now()
     where organization_id = any($1::uuid[])
       and status in ('pending', 'processing', 'failed')`,
    [[ID.org, ID.managerOrg]]
  );
  const freshnessIndex = await pool.query(
    `select to_regclass('zaltyko.outbox_events_unsettled_freshness_idx') as index_name`
  );
  assert.equal(
    freshnessIndex.rows[0].index_name,
    "zaltyko.outbox_events_unsettled_freshness_idx"
  );

  const bundle = await getOwnerDashboard({
    userId: ID.ownerUser,
    organizationId: ID.org,
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.equal(bundle.organization.id, ID.org);
  assert.equal(bundle.scope.locationId, null);
  assert.equal(bundle.scope.canViewOrganizationAggregate, true);
  assert.equal(bundle.state, "insufficient");
  assert.equal(bundle.score?.status, "insufficient_data");
  assert.equal(bundle.scoreComparison, null);
  assert.equal(bundle.dimensions.length, 4);
  assert.equal(bundle.metrics.length, 12);
  assert.equal(
    bundle.metrics.some((metric) => metric.key === "collection_rate"),
    true
  );
  assert.equal(JSON.stringify(bundle).includes("Persona Sintética"), false);

  const defaultLayout = await getOwnerDashboardLayout({
    userId: ID.ownerUser,
    organizationId: ID.org,
  });
  assert.equal(defaultLayout.version, 0);
  assert.deepEqual(defaultLayout.order, DEFAULT_OWNER_DASHBOARD_ORDER);
  const reorderedLayout = await saveOwnerDashboardLayout({
    userId: ID.ownerUser,
    organizationId: ID.org,
    order: [...DEFAULT_OWNER_DASHBOARD_ORDER].reverse(),
    expectedVersion: 0,
  });
  assert.equal(reorderedLayout.version, 1);
  assert.deepEqual(
    (await getOwnerDashboardLayout({
      userId: ID.ownerUser,
      organizationId: ID.org,
    })).order,
    [...DEFAULT_OWNER_DASHBOARD_ORDER].reverse()
  );
  await expectOperationalError(
    () =>
      saveOwnerDashboardLayout({
        userId: ID.ownerUser,
        organizationId: ID.org,
        order: DEFAULT_OWNER_DASHBOARD_ORDER,
        expectedVersion: 0,
      }),
    "VERSION_CONFLICT"
  );
  await expectOperationalError(
    () =>
      getOwnerDashboardLayout({
        userId: ID.foreignOwnerUser,
        organizationId: ID.org,
      }),
    "FORBIDDEN"
  );

  const pendingEvent = await pool.query(
    `insert into zaltyko.outbox_events (
       organization_id, location_id, event_name, aggregate_type, aggregate_id,
       idempotency_key, payload, occurred_at
     ) values ($1, $2, 'payment.webhook_confirmed', 'payment', $3,
       'freshness-pending-synthetic', '{}'::jsonb, now() - interval '14 minutes')
     returning id`,
    [ID.org, ID.location, ID.ownerUser]
  );
  const pendingDashboard = await getOwnerDashboard({
    userId: ID.ownerUser,
    organizationId: ID.org,
    locationId: ID.location,
  });
  assert.equal(pendingDashboard.freshness.status, "pending");
  assert.equal(pendingDashboard.freshness.pendingEventCount, 1);
  assert.equal(pendingDashboard.state, "empty");

  await pool.query(
    `update zaltyko.outbox_events
     set occurred_at = now() - interval '16 minutes'
     where id = $1`,
    [pendingEvent.rows[0].id]
  );
  const staleDashboard = await getOwnerDashboard({
    userId: ID.ownerUser,
    organizationId: ID.org,
    locationId: ID.location,
  });
  assert.equal(staleDashboard.freshness.status, "stale");
  assert.equal(staleDashboard.state, "empty");
  assert(staleDashboard.freshness.oldestUnsettledAgeSeconds! > 15 * 60);

  await pool.query(
    `update zaltyko.outbox_events
     set status = 'processed', processed_at = now()
     where id = $1`,
    [pendingEvent.rows[0].id]
  );
  const recoveredDashboard = await getOwnerDashboard({
    userId: ID.ownerUser,
    organizationId: ID.org,
    locationId: ID.location,
  });
  assert.equal(recoveredDashboard.freshness.status, "current");

  await pool.query(
    `insert into zaltyko.outbox_events (
       organization_id, location_id, event_name, aggregate_type, aggregate_id,
       idempotency_key, payload, status, occurred_at
     ) values ($1, $2, 'payment.webhook_confirmed', 'payment', $3,
       'freshness-failed-synthetic', '{}'::jsonb, 'failed', now() - interval '1 minute')`,
    [ID.org, ID.location, ID.ownerUser]
  );
  const failedDashboard = await getOwnerDashboard({
    userId: ID.ownerUser,
    organizationId: ID.org,
    locationId: ID.location,
  });
  assert.equal(failedDashboard.freshness.status, "failed");
  assert.equal(failedDashboard.freshness.failedEventCount, 1);

  await pool.query(
    `insert into zaltyko.outbox_events (
       organization_id, location_id, event_name, aggregate_type, aggregate_id,
       idempotency_key, payload, occurred_at
     ) values ($1, $2, 'payment.webhook_confirmed', 'payment', $3,
       'freshness-south-synthetic', '{}'::jsonb, now() - interval '14 minutes')`,
    [ID.managerOrg, ID.managerSouth, ID.scopedManagerUser]
  );
  const scopedFreshnessDashboard = await getOwnerDashboard({
    userId: ID.scopedManagerUser,
    organizationId: ID.managerOrg,
  });
  assert.equal(scopedFreshnessDashboard.scope.locationId, ID.managerNorth);
  assert.equal(scopedFreshnessDashboard.freshness.status, "current");
  assert.equal(scopedFreshnessDashboard.freshness.pendingEventCount, 0);

  const historyFirstPage = await getHealthScoreHistory({
    userId: ID.ownerUser,
    organizationId: ID.org,
    limit: 1,
  });
  assert.equal(historyFirstPage.items.length, 1);
  assert(historyFirstPage.nextCursor);
  assert.equal(historyFirstPage.items[0].dimensions.length, 4);
  assert.equal(
    JSON.stringify(historyFirstPage).includes("Persona Sintética"),
    false
  );
  const historyIds = [historyFirstPage.items[0].id];
  let historyCursor: string | null = historyFirstPage.nextCursor;
  while (historyCursor) {
    const page = await getHealthScoreHistory({
      userId: ID.ownerUser,
      organizationId: ID.org,
      limit: 1,
      cursor: historyCursor,
    });
    assert.equal(page.items.length, 1);
    historyIds.push(page.items[0].id);
    historyCursor = page.nextCursor;
  }
  const expectedHistoryRows = await pool.query(
    `select count(*)::int as count from zaltyko.health_score_snapshots where organization_id = $1 and location_id is null`,
    [ID.org]
  );
  assert.equal(historyIds.length, Number(expectedHistoryRows.rows[0].count));
  assert.equal(new Set(historyIds).size, historyIds.length);
  const metricPage1 = await getMetricSeries({
    userId: ID.ownerUser,
    organizationId: ID.org,
    metricKey: "class_fill_rate",
    limit: 1,
  });
  assert.equal(metricPage1.metric.key, "class_fill_rate");
  assert.equal(metricPage1.items.length, 1);
  assert(metricPage1.nextCursor);
  const metricValueIds = [metricPage1.items[0].id];
  let metricCursor: string | null = metricPage1.nextCursor;
  while (metricCursor) {
    const page = await getMetricSeries({
      userId: ID.ownerUser,
      organizationId: ID.org,
      metricKey: "class_fill_rate",
      limit: 1,
      cursor: metricCursor,
    });
    assert.equal(page.items.length, 1);
    metricValueIds.push(page.items[0].id);
    metricCursor = page.nextCursor;
  }
  const expectedMetricValues = await pool.query(
    `select count(*)::int as count from zaltyko.metric_run_values v join zaltyko.metric_runs r on r.id = v.metric_run_id where v.organization_id = $1 and v.metric_key = 'class_fill_rate' and v.location_id is null and r.status = 'succeeded'`,
    [ID.org]
  );
  assert.equal(
    metricValueIds.length,
    Number(expectedMetricValues.rows[0].count)
  );
  assert.equal(new Set(metricValueIds).size, metricValueIds.length);
  await expectOperationalError(
    () =>
      getMetricSeries({
        userId: ID.scopedManagerUser,
        organizationId: ID.managerOrg,
        locationId: ID.managerSouth,
        metricKey: "class_fill_rate",
      }),
    "LOCATION_SCOPE_DENIED"
  );
  const heatmapFirst = await getCapacityHeatmap({
    userId: ID.foreignOwnerUser,
    organizationId: ID.managerOrg,
    limit: 1,
  });
  assert.equal(heatmapFirst.cells.length, 1);
  assert(heatmapFirst.nextCursor);
  assert.equal(heatmapFirst.cells[0].classes.length, 1);
  assert(heatmapFirst.cells[0].capacity > 0);
  assert.equal(
    JSON.stringify(heatmapFirst).includes("Persona Sintética"),
    false
  );
  const heatmapSecond = await getCapacityHeatmap({
    userId: ID.foreignOwnerUser,
    organizationId: ID.managerOrg,
    limit: 1,
    cursor: heatmapFirst.nextCursor,
  });
  assert.equal(heatmapSecond.cells.length, 1);
  assert.equal(heatmapSecond.nextCursor, null);
  assert.notDeepEqual(
    [heatmapFirst.cells[0].isoWeekday, heatmapFirst.cells[0].startsAtLocal],
    [heatmapSecond.cells[0].isoWeekday, heatmapSecond.cells[0].startsAtLocal]
  );
  const programHeatmap = await getCapacityHeatmap({
    userId: ID.foreignOwnerUser,
    organizationId: ID.managerOrg,
    programId: "20000000-0000-0000-0000-000000000701",
  });
  assert.equal(programHeatmap.cells.length, 2);
  const dashboardFilters = await getOwnerDashboardFilterOptions({
    userId: ID.foreignOwnerUser,
    organizationId: ID.managerOrg,
    programId: ID.managerProgram,
  });
  assert(
    dashboardFilters.programs.some(
      (program) => program.id === ID.managerProgram
    )
  );
  assert.deepEqual(
    dashboardFilters.groups.map((group) => group.id),
    [ID.managerNorthGroup, ID.managerSouthGroup]
  );
  const scopedDashboardFilters = await getOwnerDashboardFilterOptions({
    userId: ID.scopedManagerUser,
    organizationId: ID.managerOrg,
    programId: ID.managerProgram,
  });
  assert.deepEqual(
    scopedDashboardFilters.groups.map((group) => group.id),
    [ID.managerNorthGroup]
  );
  await expectOperationalError(
    () =>
      getOwnerDashboardFilterOptions({
        userId: ID.scopedManagerUser,
        organizationId: ID.managerOrg,
        programId: ID.managerProgram,
        groupId: ID.managerSouthGroup,
      }),
    "INVALID_RELATION"
  );
  const groupHeatmap = await getCapacityHeatmap({
    userId: ID.foreignOwnerUser,
    organizationId: ID.managerOrg,
    groupId: "20000000-0000-0000-0000-000000000799",
  });
  assert.equal(groupHeatmap.cells.length, 0);
  const cohorts = await getRetentionCohorts({
    userId: ID.ownerUser,
    organizationId: ID.org,
    limit: 12,
  });
  assert.equal(cohorts.projection.status, "ready");
  assert(cohorts.projection.sourceWatermark);
  assert(cohorts.items.length > 0);
  assert(cohorts.items.every((cohort) => cohort.matrix.length > 0));
  assert.equal(cohorts.pauseGrace.status, "unconfigured");
  assert.equal(JSON.stringify(cohorts).includes("Persona Sintética"), false);
  const noCohortGroup = await getRetentionCohorts({
    userId: ID.ownerUser,
    organizationId: ID.org,
    groupId: "20000000-0000-0000-0000-000000000799",
  });
  assert.equal(noCohortGroup.projection.status, "ready");
  assert.equal(noCohortGroup.items.length, 0);
  const unbuiltCohorts = await getRetentionCohorts({
    userId: ID.scopedManagerUser,
    organizationId: ID.managerOrg,
  });
  assert.equal(unbuiltCohorts.projection.status, "unavailable");
  assert.equal(unbuiltCohorts.items.length, 0);
  await expectOperationalError(
    () =>
      getCapacityHeatmap({
        userId: ID.scopedManagerUser,
        organizationId: ID.managerOrg,
        locationId: ID.managerSouth,
      }),
    "LOCATION_SCOPE_DENIED"
  );

  await expectOperationalError(
    () =>
      getOwnerDashboard({
        userId: ID.foreignOwnerUser,
        organizationId: ID.org,
      }),
    "FORBIDDEN"
  );
  const denied = await pool.query(
    `select count(*)::int as count from zaltyko.audit_log
     where organization_id = $1 and action = 'owner_surface.access_denied'`,
    [ID.org]
  );
  // The deliberate cross-tenant layout read above and dashboard read are both audited.
  assert.equal(Number(denied.rows[0].count), 2);

  const scoped = await getOwnerDashboard({
    userId: ID.scopedManagerUser,
    organizationId: ID.managerOrg,
  });
  assert.equal(scoped.scope.canViewOrganizationAggregate, false);
  assert.equal(scoped.scope.locationId, ID.managerNorth);
  assert.equal(scoped.scope.locations.length, 1);
  await expectOperationalError(
    () =>
      getOwnerDashboard({
        userId: ID.scopedManagerUser,
        organizationId: ID.managerOrg,
        locationId: ID.managerSouth,
      }),
    "LOCATION_SCOPE_DENIED"
  );
  await expectOperationalError(
    () =>
      getHealthScoreHistory({
        userId: ID.scopedManagerUser,
        organizationId: ID.managerOrg,
        locationId: ID.managerSouth,
      }),
    "LOCATION_SCOPE_DENIED"
  );
  await expectOperationalError(
    () =>
      getHealthScoreHistory({
        userId: ID.ownerUser,
        organizationId: ID.org,
        cursor: "not-a-cursor",
      }),
    "INVALID_RELATION"
  );

  const locationWithoutSnapshot = await getOwnerDashboard({
    userId: ID.ownerUser,
    organizationId: ID.org,
    locationId: ID.location,
  });
  assert.equal(locationWithoutSnapshot.state, "empty");
  assert.equal(locationWithoutSnapshot.freshness.status, "failed");
  assert.equal(locationWithoutSnapshot.scope.locationId, ID.location);
  const historyWithoutSnapshot = await getHealthScoreHistory({
    userId: ID.ownerUser,
    organizationId: ID.org,
    locationId: ID.location,
  });
  assert.equal(historyWithoutSnapshot.items.length, 0);

  const timings = await Promise.all(
    Array.from({ length: 20 }, async () => {
      const started = performance.now();
      await getOwnerDashboard({
        userId: ID.ownerUser,
        organizationId: ID.org,
        from: "2026-09-01",
        to: "2026-09-30",
      });
      return performance.now() - started;
    })
  );
  const p95Ms = percentile(timings, 0.95);
  assert(p95Ms <= 800, `p95 local ${p95Ms.toFixed(1)} ms supera 800 ms`);

  console.log(
    JSON.stringify({
      status: "PASS",
      metrics: bundle.metrics.length,
      dimensions: bundle.dimensions.length,
      managerScope: scoped.scope.locationId,
      deniedAudited: Number(denied.rows[0].count),
      concurrentRequests: timings.length,
      localSyntheticP95Ms: Number(p95Ms.toFixed(1)),
      historyPages: historyIds.length,
      metricSeriesPages: metricValueIds.length,
      heatmapCells: heatmapFirst.cells.length + heatmapSecond.cells.length,
    })
  );
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
