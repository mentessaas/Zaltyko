import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; organizationId: string; isActive: boolean }>,
  queries: [] as Array<{
    predicates: Array<{ kind: string; column?: string; value?: unknown }>;
    orderColumn?: string;
    limit?: number;
  }>,
  transactionSteps: [] as string[],
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ kind: "and", conditions }),
  asc: (column: { name: string }) => ({ kind: "asc", column: column.name }),
  eq: (column: { name: string }, value: unknown) => ({
    kind: "eq",
    column: column.name,
    value,
  }),
  gt: (column: { name: string }, value: unknown) => ({
    kind: "gt",
    column: column.name,
    value,
  }),
  sql: { raw: (text: string) => ({ kind: "raw", text }) },
}));

vi.mock("@/db/zaltyko-schema", () => ({
  locations: {
    id: { name: "id" },
    organizationId: { name: "organizationId" },
    isActive: { name: "isActive" },
  },
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        execute: vi.fn(async (statement: { text?: string }) => {
          state.transactionSteps.push(`execute:${statement.text ?? "unknown"}`);
        }),
        select: () => {
          let queryState: (typeof state.queries)[number] = { predicates: [] };
          const query = {
            from: () => query,
            where: (condition: {
              kind: string;
              conditions?: Array<{
                kind: string;
                column?: string;
                value?: unknown;
              }>;
            }) => {
              queryState = {
                ...queryState,
                predicates: condition.conditions ?? [],
              };
              return query;
            },
            orderBy: (order: { column: string }) => {
              queryState.orderColumn = order.column;
              return query;
            },
            limit: async (limit: number) => {
              queryState.limit = limit;
              state.queries.push({ ...queryState });
              state.transactionSteps.push("select-page");
              const organizationId = queryState.predicates.find(
                (predicate) =>
                  predicate.kind === "eq" &&
                  predicate.column === "organizationId"
              )?.value;
              const active = queryState.predicates.find(
                (predicate) =>
                  predicate.kind === "eq" && predicate.column === "isActive"
              )?.value;
              const cursor = queryState.predicates.find(
                (predicate) =>
                  predicate.kind === "gt" && predicate.column === "id"
              )?.value;
              return state.rows
                .filter(
                  (row) =>
                    row.organizationId === organizationId &&
                    row.isActive === active &&
                    (typeof cursor !== "string" || row.id > cursor)
                )
                .sort((left, right) => left.id.localeCompare(right.id))
                .slice(0, limit)
                .map(({ id }) => ({ id }));
            },
          };
          return query;
        },
      };
      return callback(tx);
    }),
  },
}));

import {
  getSnapshotLocationIds,
  loadActiveLocationSnapshot,
} from "@/modules/analytics/application/active-location-snapshot";

const organizationId = "00000000-0000-4000-8000-000000000001";
const locationIds = [
  "00000000-0000-4000-8000-000000000010",
  "00000000-0000-4000-8000-000000000020",
  "00000000-0000-4000-8000-000000000030",
  "00000000-0000-4000-8000-000000000040",
  "00000000-0000-4000-8000-000000000050",
];

describe("active location snapshot reader", () => {
  beforeEach(() => {
    state.rows = [];
    state.queries = [];
    state.transactionSteps = [];
  });

  it("enumerates every active tenant location through ordered UUID keyset pages", async () => {
    state.rows = [
      ...locationIds.map((id) => ({ id, organizationId, isActive: true })),
      {
        id: "00000000-0000-4000-8000-000000000060",
        organizationId,
        isActive: false,
      },
      {
        id: "00000000-0000-4000-8000-000000000070",
        organizationId: "00000000-0000-4000-8000-000000000002",
        isActive: true,
      },
    ];

    const snapshot = await loadActiveLocationSnapshot(organizationId, 2);

    expect(getSnapshotLocationIds(snapshot, organizationId)).toEqual(
      locationIds
    );
    expect(state.queries).toHaveLength(4); // Includes the final empty page.
    expect(state.queries.map((query) => query.limit)).toEqual([2, 2, 2, 2]);
    expect(state.queries.map((query) => query.orderColumn)).toEqual(
      Array(4).fill("id")
    );
    expect(
      state.queries.map(
        (query) =>
          query.predicates.find((predicate) => predicate.kind === "gt")?.value
      )
    ).toEqual([undefined, locationIds[1], locationIds[3], locationIds[4]]);
    for (const query of state.queries) {
      expect(query.predicates).toContainEqual({
        kind: "eq",
        column: "organizationId",
        value: organizationId,
      });
      expect(query.predicates).toContainEqual({
        kind: "eq",
        column: "isActive",
        value: true,
      });
    }
    expect(state.transactionSteps[0]).toBe(
      "execute:SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.locationIds)).toBe(true);
  });

  it("accepts an empty location set as an organization-only snapshot", async () => {
    const snapshot = await loadActiveLocationSnapshot(organizationId, 3);

    expect(getSnapshotLocationIds(snapshot, organizationId)).toEqual([]);
    expect(state.queries).toHaveLength(1);
  });

  it("rejects snapshots from another organization and unissued raw IDs", async () => {
    const snapshot = await loadActiveLocationSnapshot(organizationId);

    expect(() =>
      getSnapshotLocationIds(snapshot, "00000000-0000-4000-8000-000000000002")
    ).toThrow("Active location snapshot does not match organization");
    expect(() =>
      getSnapshotLocationIds(
        {
          organizationId,
          locationIds: [locationIds[0]],
        } as never,
        organizationId
      )
    ).toThrow("Active location snapshot does not match organization");
  });

  it("rejects a non-positive or non-integer page size", async () => {
    await expect(loadActiveLocationSnapshot(organizationId, 0)).rejects.toThrow(
      "Active location page size must be a positive integer"
    );
    await expect(
      loadActiveLocationSnapshot(organizationId, 1.5)
    ).rejects.toThrow("Active location page size must be a positive integer");
  });
});
