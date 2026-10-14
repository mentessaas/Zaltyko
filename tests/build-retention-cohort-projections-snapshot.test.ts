import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadActiveLocationSnapshot: vi.fn(),
  getSnapshotLocationIds: vi.fn(),
  transaction: vi.fn(),
  insertedScopes: [] as Array<{
    locationId: string | null;
    idempotencyKey: string;
  }>,
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ conditions }),
  eq: (column: unknown, value: unknown) => ({ column, value }),
  inArray: (column: unknown, values: unknown[]) => ({ column, values }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    { join: (values: unknown[]) => values, raw: (text: string) => text }
  ),
}));

vi.mock("@/db/zaltyko-schema", () => ({
  metricRuns: {
    id: "metricRuns.id",
    organizationId: "metricRuns.organizationId",
    sourceWatermark: "metricRuns.sourceWatermark",
    status: "metricRuns.status",
  },
  retentionCohortProjectionRuns: {
    id: "projectionRuns.id",
    idempotencyKey: "projectionRuns.idempotencyKey",
    organizationId: "projectionRuns.organizationId",
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        where: () => query,
        limit: async () => [
          {
            id: "00000000-0000-4000-8000-000000000010",
            sourceWatermark: new Date("2026-10-14T10:00:00.000Z"),
          },
        ],
      };
      return query;
    },
    transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/cron-system-actor", () => ({
  assertCurrentCronSystemActor: vi.fn(),
}));
vi.mock("@/modules/analytics/application/active-location-snapshot", () => ({
  loadActiveLocationSnapshot: mocks.loadActiveLocationSnapshot,
  getSnapshotLocationIds: mocks.getSnapshotLocationIds,
}));

import { buildRetentionCohortProjections } from "@/modules/analytics/application/build-retention-cohort-projections";
import type { ActiveLocationSnapshot } from "@/modules/analytics/application/active-location-snapshot";
import type { SystemActor } from "@/modules/shared/application/actor";

const organizationId = "00000000-0000-4000-8000-000000000001";
const snapshot = {
  organizationId,
  locationIds: ["00000000-0000-4000-8000-000000000020"],
} as ActiveLocationSnapshot;

describe("retention projection location snapshot contract", () => {
  beforeEach(() => {
    mocks.loadActiveLocationSnapshot.mockReset();
    mocks.getSnapshotLocationIds.mockReset();
    mocks.getSnapshotLocationIds.mockImplementation(
      (received: ActiveLocationSnapshot, requestedOrganizationId: string) => {
        if (received.organizationId !== requestedOrganizationId) {
          throw new Error(
            "Active location snapshot does not match organization"
          );
        }
        return received.locationIds;
      }
    );
    mocks.loadActiveLocationSnapshot.mockResolvedValue(snapshot);
    mocks.insertedScopes = [];
    mocks.transaction.mockReset();
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          execute: async () => undefined,
          insert: () => ({
            values: (rows: typeof mocks.insertedScopes) => ({
              onConflictDoNothing: async () => {
                mocks.insertedScopes = rows;
                throw new Error("writer transaction reached");
              },
            }),
          }),
        };
        return callback(tx);
      }
    );
  });

  it("loads its own empty snapshot when standalone and retains one organization scope", async () => {
    mocks.loadActiveLocationSnapshot.mockResolvedValue({
      organizationId,
      locationIds: [],
    });
    mocks.getSnapshotLocationIds.mockReturnValue([]);

    await expect(
      buildRetentionCohortProjections({
        organizationId,
        metricRunId: "00000000-0000-4000-8000-000000000010",
        actor: {} as SystemActor,
      })
    ).rejects.toThrow("writer transaction reached");

    expect(mocks.loadActiveLocationSnapshot).toHaveBeenCalledWith(
      organizationId
    );
    expect(mocks.getSnapshotLocationIds).toHaveBeenCalledWith(
      expect.objectContaining({ locationIds: [] }),
      organizationId
    );
    expect(mocks.insertedScopes).toHaveLength(1);
    expect(mocks.insertedScopes[0]).toEqual(
      expect.objectContaining({
        locationId: null,
        idempotencyKey:
          "metric:00000000-0000-4000-8000-000000000010:scope:organization",
      })
    );
  });

  it("reuses a supplied snapshot and rejects a foreign organization before writing", async () => {
    await expect(
      buildRetentionCohortProjections({
        organizationId,
        metricRunId: "00000000-0000-4000-8000-000000000010",
        actor: {} as SystemActor,
        locationSnapshot: {
          ...snapshot,
          organizationId: "00000000-0000-4000-8000-000000000002",
        },
      })
    ).rejects.toThrow("Active location snapshot does not match organization");

    expect(mocks.loadActiveLocationSnapshot).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
