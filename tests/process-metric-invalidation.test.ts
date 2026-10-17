import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  benchmarkProfiles: [] as Array<{ id: string; currency: string | null }>,
  benchmarkProfileLimits: [] as number[],
  invalidationLocationId: null as string | null,
  activeLocationSnapshot: null as unknown,
  activeLocationIds: [] as string[],
  loadActiveLocationSnapshot: vi.fn(),
  getSnapshotLocationIds: vi.fn(),
  calculateAcademyHealthScore: vi.fn(),
  evaluateP0Insights: vi.fn(),
  recomputeMetrics: vi.fn(),
  buildRetentionCohortProjections: vi.fn(),
}));

vi.mock("@/db/zaltyko-schema", () => {
  const table = (name: string) => ({ _name: name });
  return {
    auditLog: table("auditLog"),
    benchmarkProfiles: table("benchmarkProfiles"),
    healthScoreVersions: table("healthScoreVersions"),
    metricInvalidations: table("metricInvalidations"),
    organizations: table("organizations"),
    outboxEvents: table("outboxEvents"),
  };
});

vi.mock("@/db", () => ({
  db: {
    select: () => {
      let tableName = "";
      const rowsFor = (limit?: number): unknown[] => {
        switch (tableName) {
          case "metricInvalidations":
            return [
              {
                id: "invalidation-1",
                locationId: mocks.invalidationLocationId,
                affectedFrom: "2026-10-01",
                affectedTo: "2026-10-14",
              },
            ];
          case "outboxEvents":
            return [{ occurredAt: new Date("2026-10-14T10:00:00.000Z") }];
          case "organizations":
            return [{ status: "active", currency: "EUR" }];
          case "benchmarkProfiles":
            return mocks.benchmarkProfiles.slice(0, limit);
          case "healthScoreVersions":
            return [{ key: "zaltyko_owner_health", version: 1 }];
          default:
            return [];
        }
      };

      const query = {
        from(table: { _name: string }) {
          tableName = table._name;
          return query;
        },
        where() {
          return query;
        },
        orderBy() {
          return query;
        },
        limit(limit: number) {
          if (tableName === "benchmarkProfiles") {
            mocks.benchmarkProfileLimits.push(limit);
          }
          return Promise.resolve(rowsFor(limit));
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?:
            ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?:
            ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return Promise.resolve(rowsFor()).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
    transaction: vi.fn(async () => undefined),
  },
}));

vi.mock("@/lib/cron-system-actor", () => ({
  assertCurrentCronSystemActor: vi.fn(),
}));
vi.mock("@/modules/analytics/application/metric-engine", () => ({
  recomputeMetrics: mocks.recomputeMetrics,
}));
vi.mock(
  "@/modules/analytics/application/build-retention-cohort-projections",
  () => ({
    buildRetentionCohortProjections: mocks.buildRetentionCohortProjections,
  })
);
vi.mock("@/modules/analytics/application/active-location-snapshot", () => ({
  loadActiveLocationSnapshot: mocks.loadActiveLocationSnapshot,
  getSnapshotLocationIds: mocks.getSnapshotLocationIds,
}));
vi.mock("@/modules/health-score/application/health-score-service", () => ({
  calculateAcademyHealthScore: mocks.calculateAcademyHealthScore,
}));
vi.mock("@/modules/insights/application/evaluate-p0-rules", () => ({
  evaluateP0Insights: mocks.evaluateP0Insights,
}));

import { processMetricInvalidation } from "@/modules/analytics/application/process-metric-invalidation";
import type { SystemActor } from "@/modules/shared/application/actor";

describe("processMetricInvalidation benchmark profile cardinality", () => {
  beforeEach(() => {
    mocks.benchmarkProfiles = [];
    mocks.benchmarkProfileLimits = [];
    mocks.invalidationLocationId = null;
    mocks.activeLocationIds = ["00000000-0000-4000-8000-000000000001"];
    mocks.activeLocationSnapshot = {
      organizationId: "organization-1",
      locationIds: mocks.activeLocationIds,
    };
    mocks.loadActiveLocationSnapshot.mockReset();
    mocks.loadActiveLocationSnapshot.mockResolvedValue(
      mocks.activeLocationSnapshot
    );
    mocks.getSnapshotLocationIds.mockReset();
    mocks.getSnapshotLocationIds.mockImplementation(
      (snapshot: { locationIds: string[] }) => snapshot.locationIds
    );
    mocks.calculateAcademyHealthScore.mockReset();
    mocks.calculateAcademyHealthScore.mockResolvedValue({ id: "snapshot-1" });
    mocks.evaluateP0Insights.mockReset();
    mocks.evaluateP0Insights.mockResolvedValue(undefined);
    mocks.recomputeMetrics.mockReset();
    mocks.recomputeMetrics.mockResolvedValue({
      id: "metric-run-1",
      status: "succeeded",
    });
    mocks.buildRetentionCohortProjections.mockReset();
    mocks.buildRetentionCohortProjections.mockResolvedValue({
      projectionRuns: 1,
      projectionRows: 0,
    });
  });

  it.each([
    {
      count: 0,
      expectedReason: "benchmark_missing",
      expectedSnapshotId: null,
    },
    { count: 1, expectedReason: null, expectedSnapshotId: "snapshot-1" },
    {
      count: 2,
      expectedReason: "benchmark_ambiguous",
      expectedSnapshotId: null,
    },
    {
      count: 4,
      expectedReason: "benchmark_ambiguous",
      expectedSnapshotId: null,
    },
  ])(
    "$count active profile(s) preserve the existing score decision",
    async ({ count, expectedReason, expectedSnapshotId }) => {
      mocks.benchmarkProfiles = Array.from({ length: count }, (_, index) => ({
        id: `benchmark-${index + 1}`,
        currency: "EUR",
      }));

      const result = await processMetricInvalidation({
        organizationId: "organization-1",
        outboxEventId: "outbox-1",
        actor: {} as SystemActor,
      });

      expect(mocks.benchmarkProfileLimits).toEqual([2]);
      expect(result?.scoreSkippedReason).toBe(expectedReason);
      expect(result?.scoreSnapshotId).toBe(expectedSnapshotId);
      expect(mocks.calculateAcademyHealthScore).toHaveBeenCalledTimes(
        count === 1 ? 1 : 0
      );
      expect(mocks.loadActiveLocationSnapshot).toHaveBeenCalledTimes(1);
      expect(mocks.buildRetentionCohortProjections).toHaveBeenCalledWith(
        expect.objectContaining({
          locationSnapshot: mocks.activeLocationSnapshot,
        })
      );
    }
  );

  it("keeps a location invalidation scoped to that insight target and shares the full snapshot with cohorts", async () => {
    const locationIds = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ];
    mocks.invalidationLocationId = locationIds[1];
    mocks.activeLocationIds = locationIds;
    mocks.activeLocationSnapshot = {
      organizationId: "organization-1",
      locationIds,
    };
    mocks.loadActiveLocationSnapshot.mockResolvedValue(
      mocks.activeLocationSnapshot
    );
    mocks.getSnapshotLocationIds.mockImplementation(
      (snapshot: { locationIds: string[] }) => snapshot.locationIds
    );

    await processMetricInvalidation({
      organizationId: "organization-1",
      outboxEventId: "outbox-1",
      actor: {} as SystemActor,
    });

    expect(mocks.loadActiveLocationSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.recomputeMetrics).toHaveBeenCalledTimes(2);
    expect(mocks.recomputeMetrics).toHaveBeenLastCalledWith(
      expect.objectContaining({
        authorizationLocationId: locationIds[1],
        targetLocationId: locationIds[1],
      })
    );
    expect(mocks.evaluateP0Insights).toHaveBeenCalledTimes(1);
    expect(mocks.evaluateP0Insights).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: locationIds[1] })
    );
    expect(mocks.buildRetentionCohortProjections).toHaveBeenCalledWith(
      expect.objectContaining({
        locationSnapshot: mocks.activeLocationSnapshot,
      })
    );
  });
});
