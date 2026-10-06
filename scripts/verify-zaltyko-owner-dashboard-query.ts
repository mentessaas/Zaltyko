import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { Pool } from "pg";

import { getOwnerDashboard } from "@/modules/owner-dashboard/application/get-owner-dashboard";
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
  assert.equal(bundle.dimensions.length, 4);
  assert.equal(bundle.metrics.length, 12);
  assert.equal(
    bundle.metrics.some((metric) => metric.key === "collection_rate"),
    true
  );
  assert.equal(JSON.stringify(bundle).includes("Persona Sintética"), false);

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
     where organization_id = $1 and action = 'owner_dashboard.access_denied'`,
    [ID.org]
  );
  assert.equal(Number(denied.rows[0].count), 1);

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

  const locationWithoutSnapshot = await getOwnerDashboard({
    userId: ID.ownerUser,
    organizationId: ID.org,
    locationId: ID.location,
  });
  assert.equal(locationWithoutSnapshot.state, "empty");
  assert.equal(locationWithoutSnapshot.scope.locationId, ID.location);

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
    })
  );
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
