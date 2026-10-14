import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks, tables } = vi.hoisted(() => {
  const names = [
    "benchmarkProfiles",
    "healthScoreDimensionSnapshots",
    "healthScoreSnapshots",
  ];
  const tables = Object.fromEntries(
    names.map((name) => [
      name,
      new Proxy(
        { tableName: name },
        {
          get: (target, property) =>
            property in target
              ? target[property as keyof typeof target]
              : { tableName: name, columnName: String(property) },
        }
      ),
    ])
  );
  return {
    mocks: {
      selectedSnapshots: [] as Array<Record<string, unknown>>,
      queries: [] as Array<{
        table: string;
        where: unknown;
        limit: number | null;
      }>,
      resolveOwnerScope: vi.fn(),
    },
    tables,
  };
});

vi.mock("@/db/zaltyko-schema", () => ({
  ...tables,
  healthDimension: {
    enumValues: ["enrollment", "financial", "operational", "workforce"],
  },
}));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      let table = "";
      let where: unknown;
      let limit: number | null = null;
      const query = {
        from: (source: { tableName: string }) => {
          table = source.tableName;
          return query;
        },
        innerJoin: () => query,
        where: (predicate: unknown) => {
          where = predicate;
          return query;
        },
        orderBy: () => query,
        limit: (value: number) => {
          limit = value;
          return query;
        },
        then: (
          resolve: (rows: Array<Record<string, unknown>>) => unknown,
          reject?: (reason: unknown) => unknown
        ) => {
          mocks.queries.push({ table, where, limit });
          const rows =
            table === "healthScoreSnapshots" ? mocks.selectedSnapshots : [];
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.resolveOwnerScope,
}));
vi.mock("drizzle-orm", () => {
  const condition =
    (op: string) =>
    (...args: unknown[]) => ({ op, args });
  return {
    and: condition("and"),
    desc: (column: unknown) => ({ op: "desc", column }),
    eq: condition("eq"),
    inArray: condition("inArray"),
    isNull: condition("isNull"),
    sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({
      parts,
      values,
    }),
  };
});

import { getHealthScoreHistory } from "@/modules/owner-dashboard/application/health-score-history";

const organizationId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function snapshotRow(index: number) {
  return {
    snapshot: {
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      score: "75.00",
      status: "healthy",
      coverage: "0.75",
      computedAt: new Date("2026-02-01T00:00:00.000Z"),
      sourceWatermark: new Date("2026-02-01T00:00:00.000Z"),
      explanation: {},
    },
    benchmarkName: "Fixture",
    benchmarkSource: "Fuente de prueba",
  };
}

function containsOrganizationFilter(predicate: unknown): boolean {
  if (!predicate || typeof predicate !== "object") return false;
  const node = predicate as { op?: string; args?: unknown[] };
  if (node.op === "eq") {
    const [column, value] = node.args as
      [{ tableName: string; columnName: string }, unknown] | [];
    return (
      column?.tableName === "healthScoreDimensionSnapshots" &&
      column.columnName === "organizationId" &&
      value === organizationId
    );
  }
  return node.args?.some(containsOrganizationFilter) ?? false;
}

describe("health score history dimension bound", () => {
  beforeEach(() => {
    mocks.selectedSnapshots = [];
    mocks.queries = [];
    mocks.resolveOwnerScope.mockResolvedValue({
      organization: { id: organizationId },
      selectedLocationId: null,
      locations: [],
      canViewOrganizationAggregate: true,
    });
  });

  it("bounds 50 snapshots by the canonical dimensions and keeps organization scope", async () => {
    mocks.selectedSnapshots = Array.from({ length: 50 }, (_, index) =>
      snapshotRow(index + 1)
    );

    const result = await getHealthScoreHistory({
      userId,
      organizationId,
      limit: 50,
    });

    expect(result.items).toHaveLength(50);
    const dimensionQuery = mocks.queries.find(
      (query) => query.table === "healthScoreDimensionSnapshots"
    );
    expect(dimensionQuery?.limit).toBe(200);
    expect(containsOrganizationFilter(dimensionQuery?.where)).toBe(true);
  });

  it("does not query dimensions when there are no snapshots", async () => {
    await getHealthScoreHistory({ userId, organizationId });

    expect(
      mocks.queries.some(
        (query) => query.table === "healthScoreDimensionSnapshots"
      )
    ).toBe(false);
  });
});
