import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";

// These tests verify query construction and batching with mocks; they do not execute PostgreSQL.

const mocks = vi.hoisted(() => ({
  activeLocationIds: [] as string[],
  databaseRuns: [] as Array<{
    id: string;
    organizationId: string;
    locationId: string | null;
    idempotencyKey: string;
    status: string;
    rowCount: number;
  }>,
  insertBatches: [] as Array<Array<{ idempotencyKey: string }>>,
  reads: [] as Array<{
    kind: string;
    organizationId?: unknown;
    keys?: string[];
    ids?: string[];
    limit?: number;
    orderColumn?: string;
    forUpdate: boolean;
  }>,
  executedSql: [] as unknown[],
  loadActiveLocationSnapshot: vi.fn(),
  getSnapshotLocationIds: vi.fn(),
  transaction: vi.fn(),
  nextGeneratedId: 0,
  initialStatus: "running",
}));

vi.mock("drizzle-orm", async () => {
  const actual =
    await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    and: (...conditions: Array<Record<string, unknown>>) => ({
      op: "and",
      conditions,
    }),
    asc: (column: { name: string }) => ({
      op: "asc",
      column: column.name,
    }),
    eq: (column: { name: string }, value: unknown) => ({
      op: "eq",
      column: column.name,
      value,
    }),
    inArray: (column: { name: string }, values: string[]) => ({
      op: "in",
      column: column.name,
      values,
    }),
  };
});

vi.mock("@/db/zaltyko-schema", () => ({
  metricRuns: {
    _name: "metricRuns",
    id: { name: "id" },
    organizationId: { name: "organizationId" },
    sourceWatermark: { name: "sourceWatermark" },
    status: { name: "status" },
  },
  retentionCohortProjectionRuns: {
    _name: "retentionCohortProjectionRuns",
    id: { name: "id" },
    idempotencyKey: { name: "idempotencyKey" },
    locationId: { name: "locationId" },
    organizationId: { name: "organizationId" },
    rowCount: { name: "rowCount" },
    status: { name: "status" },
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
const metricRunId = "00000000-0000-4000-8000-000000000010";
const pageSize = 500;
const require = createRequire(import.meta.url);

function uuidFromNumber(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function flattenConditions(
  condition: Record<string, unknown>
): Array<Record<string, unknown>> {
  return condition.op === "and"
    ? (condition.conditions as Array<Record<string, unknown>>).flatMap(
        flattenConditions
      )
    : [condition];
}

function configureTransactionMock() {
  mocks.transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: async (query: unknown) => {
          mocks.executedSql.push(query);
        },
        insert: () => ({
          values: (rows: Array<Record<string, unknown>>) => ({
            onConflictDoNothing: async () => {
              mocks.insertBatches.push(
                rows.map((row) => ({
                  idempotencyKey: String(row.idempotencyKey),
                }))
              );
              for (const row of rows) {
                const duplicate = mocks.databaseRuns.some(
                  (run) =>
                    run.organizationId === row.organizationId &&
                    run.idempotencyKey === row.idempotencyKey
                );
                if (!duplicate) {
                  mocks.databaseRuns.push({
                    id: uuidFromNumber(10_000 - mocks.nextGeneratedId++),
                    organizationId: String(row.organizationId),
                    locationId: row.locationId as string | null,
                    idempotencyKey: String(row.idempotencyKey),
                    status: mocks.initialStatus,
                    rowCount: 1,
                  });
                }
              }
            },
          }),
        }),
        select: (selection: Record<string, { name: string }>) => {
          let predicates: Array<Record<string, unknown>> = [];
          let limit: number | undefined;
          let orderColumn: string | undefined;
          let forUpdate = false;
          const query = {
            from: () => {
              return query;
            },
            where: (condition: Record<string, unknown>) => {
              predicates = flattenConditions(condition);
              return query;
            },
            orderBy: (order: { column: string }) => {
              orderColumn = order.column;
              return query;
            },
            limit: (value: number) => {
              limit = value;
              return query;
            },
            for: (mode: string) => {
              forUpdate = mode === "update";
              return query;
            },
            then: (
              resolve: (value: unknown[]) => unknown,
              reject?: (error: unknown) => unknown
            ) => {
              try {
                const organizationFilter = predicates.find(
                  (predicate) =>
                    predicate.op === "eq" &&
                    predicate.column === "organizationId"
                );
                const organizationValue = organizationFilter?.value;
                const keyFilter = predicates.find(
                  (predicate) =>
                    predicate.op === "in" &&
                    predicate.column === "idempotencyKey"
                );
                const idFilter = predicates.find(
                  (predicate) =>
                    predicate.op === "in" && predicate.column === "id"
                );
                const keys = (keyFilter?.values as string[] | undefined) ?? [];
                const ids = (idFilter?.values as string[] | undefined) ?? [];
                let kind = "unknown";
                let rows: unknown[] = [];

                if (Object.keys(selection).join(",") === "id") {
                  kind = "discover";
                  rows = mocks.databaseRuns
                    .filter(
                      (run) =>
                        run.organizationId === organizationValue &&
                        keys.includes(run.idempotencyKey)
                    )
                    .sort((left, right) =>
                      left.id < right.id ? -1 : left.id > right.id ? 1 : 0
                    )
                    .map(({ id }) => ({ id }));
                } else if (Object.keys(selection).join(",") === "rowCount") {
                  kind = "completed";
                  rows = mocks.databaseRuns
                    .filter(
                      (run) =>
                        run.organizationId === organizationValue &&
                        ids.includes(run.id)
                    )
                    .map(({ rowCount }) => ({ rowCount }));
                } else {
                  kind = "lock";
                  rows = mocks.databaseRuns
                    .filter(
                      (run) =>
                        run.organizationId === organizationValue &&
                        ids.includes(run.id)
                    )
                    .sort((left, right) =>
                      left.id < right.id ? -1 : left.id > right.id ? 1 : 0
                    )
                    .map(({ id, locationId, status, idempotencyKey }) => ({
                      id,
                      locationId,
                      status,
                      idempotencyKey,
                    }));
                }

                mocks.reads.push({
                  kind,
                  organizationId: organizationValue,
                  keys: keyFilter ? keys : undefined,
                  ids: idFilter ? ids : undefined,
                  limit,
                  orderColumn,
                  forUpdate,
                });
                return Promise.resolve(
                  limit === undefined ? rows : rows.slice(0, limit)
                ).then(resolve, reject);
              } catch (error) {
                return Promise.reject(error).then(resolve, reject);
              }
            },
          };
          return query;
        },
        update: () => ({
          set: () => ({
            where: async () => undefined,
          }),
        }),
      };
      return callback(tx);
    }
  );
}

describe("retention projection run batching", () => {
  beforeEach(() => {
    mocks.activeLocationIds = [];
    mocks.databaseRuns = [];
    mocks.insertBatches = [];
    mocks.reads = [];
    mocks.executedSql = [];
    mocks.nextGeneratedId = 0;
    mocks.initialStatus = "running";
    mocks.loadActiveLocationSnapshot.mockReset();
    mocks.getSnapshotLocationIds.mockReset();
    mocks.getSnapshotLocationIds.mockImplementation(
      (snapshot: ActiveLocationSnapshot, requestedOrganizationId: string) => {
        if (snapshot.organizationId !== requestedOrganizationId) {
          throw new Error(
            "Active location snapshot does not match organization"
          );
        }
        return snapshot.locationIds;
      }
    );
    mocks.loadActiveLocationSnapshot.mockResolvedValue({
      organizationId,
      locationIds: [],
    });
    mocks.transaction.mockReset();
    configureTransactionMock();
  });

  it("processes more than two batches without omissions and locks globally by ID", async () => {
    mocks.activeLocationIds = Array.from({ length: 1_001 }, (_, index) =>
      uuidFromNumber(index + 1)
    );
    mocks.getSnapshotLocationIds.mockReturnValue(mocks.activeLocationIds);

    const result = await buildRetentionCohortProjections({
      organizationId,
      metricRunId,
      actor: {} as SystemActor,
      locationSnapshot: {
        organizationId,
        locationIds: mocks.activeLocationIds,
      } as ActiveLocationSnapshot,
    });

    const expectedScopeCount = mocks.activeLocationIds.length + 1;
    const expectedKeys = [
      `metric:${metricRunId}:scope:organization`,
      ...mocks.activeLocationIds.map(
        (locationId) => `metric:${metricRunId}:scope:location:${locationId}`
      ),
    ];
    const expectedIds = mocks.databaseRuns
      .map((run) => run.id)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    const insertSizes = mocks.insertBatches.map((batch) => batch.length);
    const discoveryReads = mocks.reads.filter(
      (read) => read.kind === "discover"
    );
    const lockReads = mocks.reads.filter((read) => read.kind === "lock");
    const completedReads = mocks.reads.filter(
      (read) => read.kind === "completed"
    );

    expect(result).toEqual({
      projectionRuns: expectedScopeCount,
      projectionRows: expectedScopeCount,
    });
    expect(insertSizes).toEqual([pageSize, pageSize, 2]);
    expect(
      mocks.insertBatches.flat().map((scope) => scope.idempotencyKey)
    ).toEqual(expectedKeys.slice().sort());
    expect(discoveryReads.map((read) => read.limit)).toEqual([
      pageSize,
      pageSize,
      2,
    ]);
    expect(new Set(discoveryReads.flatMap((read) => read.keys ?? []))).toEqual(
      new Set(expectedKeys)
    );
    expect(lockReads.map((read) => read.limit)).toEqual([
      pageSize,
      pageSize,
      2,
    ]);
    expect(lockReads.flatMap((read) => read.ids ?? [])).toEqual(expectedIds);
    expect(
      lockReads.every((read) => read.forUpdate && read.orderColumn === "id")
    ).toBe(true);
    expect(completedReads.map((read) => read.limit)).toEqual([
      pageSize,
      pageSize,
      2,
    ]);
    expect(completedReads.flatMap((read) => read.ids ?? [])).toEqual(
      expectedIds
    );
    expect(
      mocks.reads.every(
        (read) =>
          read.organizationId === organizationId && read.limit !== undefined
      )
    ).toBe(true);
  });

  it("preserves idempotency and skips completion reads when all scope runs already succeeded", async () => {
    mocks.initialStatus = "succeeded";

    const input = {
      organizationId,
      metricRunId,
      actor: {} as SystemActor,
      locationSnapshot: {
        organizationId,
        locationIds: [],
      } as ActiveLocationSnapshot,
    };
    const first = await buildRetentionCohortProjections(input);
    const second = await buildRetentionCohortProjections(input);

    expect(first).toEqual({ projectionRuns: 1, projectionRows: 0 });
    expect(second).toEqual(first);
    expect(mocks.databaseRuns).toHaveLength(1);
    expect(mocks.databaseRuns[0].idempotencyKey).toBe(
      `metric:${metricRunId}:scope:organization`
    );
    expect(
      mocks.reads.filter((read) => read.kind === "completed")
    ).toHaveLength(0);
    expect(mocks.executedSql).toHaveLength(2); // Existing 120s setup only.
  });

  it("binds all run UUIDs as one uuid array parameter without changing the cohort CTE", async () => {
    const pgCore = await vi.importActual<typeof import("drizzle-orm/pg-core")>(
      "drizzle-orm/pg-core"
    );
    const dialect = new pgCore.PgDialect();

    mocks.activeLocationIds = [uuidFromNumber(1), uuidFromNumber(2)];
    mocks.getSnapshotLocationIds.mockReturnValue(mocks.activeLocationIds);
    await buildRetentionCohortProjections({
      organizationId,
      metricRunId,
      actor: {} as SystemActor,
      locationSnapshot: {
        organizationId,
        locationIds: mocks.activeLocationIds,
      } as ActiveLocationSnapshot,
    });

    const compiled = mocks.executedSql.map((query) =>
      dialect.sqlToQuery(query as SQL)
    );
    const runArrayStatements = compiled.filter((query) =>
      query.params.some(Array.isArray)
    );
    const expectedRunIds = mocks.databaseRuns
      .filter((run) => run.status !== "succeeded")
      .map((run) => run.id)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    const pgUtils = require("pg/lib/utils") as {
      prepareValue: (value: unknown) => unknown;
    };

    expect(runArrayStatements).toHaveLength(3);
    for (const query of runArrayStatements) {
      expect(query.params.filter(Array.isArray)).toEqual([expectedRunIds]);
      expect(query.sql).toMatch(/= any\(\$\d+::uuid\[\]\)/i);
    }
    const cteQuery = compiled.find((query) =>
      query.sql.includes("with projection_scopes as materialized")
    );
    expect(cteQuery?.sql).toContain("from aggregate_states aggregate");
    expect(pgUtils.prepareValue(expectedRunIds)).toBe(
      `{${expectedRunIds.map((id) => `"${id}"`).join(",")}}`
    );
  });
});
