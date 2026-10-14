import { beforeEach, describe, expect, it, vi } from "vitest";

const { makeQuery, mocks, tables } = vi.hoisted(() => {
  const tableNames = [
    "auditLog",
    "benchmarkMetricTargets",
    "benchmarkProfiles",
    "locations",
    "organizations",
  ];
  const tables = Object.fromEntries(
    tableNames.map((name) => [
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

  function matches(predicate: unknown, row: Record<string, unknown>): boolean {
    if (!predicate || typeof predicate !== "object") return true;
    const node = predicate as { op: string; args: unknown[] };
    if (node.op === "and") return node.args.every((item) => matches(item, row));
    if (node.op === "or") return node.args.some((item) => matches(item, row));
    const [column, value] = node.args as [{ columnName: string }, unknown];
    const actual = row[column.columnName];
    if (node.op === "eq") return actual === value;
    if (node.op === "inArray") return (value as unknown[]).includes(actual);
    if (node.op === "isNull") return actual === null;
    return true;
  }

  const mocks = {
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    queries: [] as Array<{
      table: string;
      where: unknown;
      limit: number | null;
    }>,
    assertOperationalAccess: vi.fn(),
    transaction: undefined as unknown,
  };

  function makeQuery() {
    let table = "";
    let where: unknown;
    let limit: number | null = null;
    const query = {
      from: (source: { tableName: string }) => {
        table = source.tableName;
        return query;
      },
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
        const filtered = (mocks.rows[table] ?? []).filter((row) =>
          matches(where, row)
        );
        return Promise.resolve(
          limit === null ? filtered : filtered.slice(0, limit)
        ).then(resolve, reject);
      },
    };
    return query;
  }

  return { makeQuery, mocks, tables };
});

vi.mock("@/db/zaltyko-schema", () => tables);
vi.mock("@/db", () => ({
  db: {
    select: () => makeQuery(),
    transaction: (callback: (tx: unknown) => unknown) =>
      callback(mocks.transaction),
  },
}));
vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: mocks.assertOperationalAccess,
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
  lockCommand: vi.fn(),
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
    isNull: (column: unknown) => ({ op: "isNull", args: [column] }),
    or: condition("or"),
  };
});

import {
  getAcademyTargetProfile,
  saveAcademyTargetProfile,
} from "@/modules/health-score/application/academy-target-profile";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "33333333-3333-4333-8333-333333333333";
const authorizationLocationId = "44444444-4444-4444-8444-444444444444";
const userId = "22222222-2222-4222-8222-222222222222";
const memberId = "55555555-5555-4555-8555-555555555555";
const profileId = "66666666-6666-4666-8666-666666666666";
const extraProfileId = "77777777-7777-4777-8777-777777777777";

const canonicalTargets = [
  ["class_fill_rate", 0.7],
  ["cohort_retention_rate", 0.8],
  ["churn_rate", 0.2],
  ["collection_rate", 0.9],
  ["attendance_coverage", 0.95],
] as const;

function targetRows(
  entries: ReadonlyArray<readonly [string, number]>,
  targetProfileId = profileId,
  collectionCurrency = "GBP"
) {
  return entries.map(([metricKey, targetNumeric]) => ({
    benchmarkProfileId: targetProfileId,
    metricKey,
    targetNumeric: String(targetNumeric),
    value: String(targetNumeric),
    currency: metricKey === "collection_rate" ? collectionCurrency : null,
  }));
}

function makeTransaction() {
  return {
    select: () => makeQuery(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  };
}

const command = {
  organizationId,
  authorizationLocationId,
  actor: { userId, memberId },
  targets: Object.fromEntries(canonicalTargets),
  idempotencyKey: "academy-target-profile-test-001",
};

function canonicalMetricFilter(query: { where: unknown }) {
  const collectInArray = (predicate: unknown): unknown[][] => {
    if (!predicate || typeof predicate !== "object") return [];
    const node = predicate as { op?: string; args?: unknown[] };
    if (node.op === "inArray") return [node.args ?? []];
    return (node.args ?? []).flatMap(collectInArray);
  };
  return collectInArray(query.where).find((args) => {
    const [column] = args;
    return (
      column &&
      typeof column === "object" &&
      (column as { tableName?: string; columnName?: string }).tableName ===
        "benchmarkMetricTargets" &&
      (column as { columnName?: string }).columnName === "metricKey"
    );
  });
}

function profileCurrencyFilter(query: { where: unknown }) {
  const collectCurrency = (predicate: unknown): unknown[][] => {
    if (!predicate || typeof predicate !== "object") return [];
    const node = predicate as { op?: string; args?: unknown[] };
    if (node.op === "eq") {
      const [column] = node.args ?? [];
      if (
        column &&
        typeof column === "object" &&
        (column as { tableName?: string; columnName?: string }).tableName ===
          "benchmarkMetricTargets" &&
        (column as { columnName?: string }).columnName === "currency"
      ) {
        return [node.args ?? []];
      }
    }
    return (node.args ?? []).flatMap(collectCurrency);
  };
  return collectCurrency(query.where).find((args) => args[1] === "GBP");
}

describe("academy target profile canonical metric reads", () => {
  beforeEach(() => {
    mocks.rows = {};
    mocks.queries = [];
    mocks.assertOperationalAccess.mockReset().mockResolvedValue(undefined);
    mocks.transaction = makeTransaction();
  });

  it("returns only the five canonical metrics when a profile has extra metrics", async () => {
    mocks.rows.benchmarkProfiles = [
      {
        id: profileId,
        organizationId,
        key: "academy_internal_targets",
        status: "active",
        version: 1,
        name: "Objetivos internos",
        currency: "GBP",
      },
      {
        id: extraProfileId,
        organizationId: otherOrganizationId,
        key: "academy_internal_targets",
        status: "active",
        version: 8,
        name: "Perfil de otra organización",
        currency: "EUR",
      },
    ];
    mocks.rows.organizations = [{ id: organizationId, defaultCurrency: "EUR" }];
    mocks.rows.benchmarkMetricTargets = [
      ...targetRows(canonicalTargets),
      ...targetRows([["active_athletes_count", 120]], profileId),
      ...targetRows(canonicalTargets, extraProfileId),
      ...targetRows([["collection_rate", 0.85]], profileId, "EUR"),
    ];

    const result = await getAcademyTargetProfile(organizationId);

    expect(Object.keys(result?.targets ?? {}).sort()).toEqual(
      canonicalTargets.map(([key]) => key).sort()
    );
    const targetQuery = mocks.queries.find(
      (query) => query.table === "benchmarkMetricTargets"
    );
    expect(targetQuery?.limit).toBe(6);
    expect(canonicalMetricFilter(targetQuery!)?.[1]).toEqual(
      canonicalTargets.map(([key]) => key)
    );
    expect(profileCurrencyFilter(targetQuery!)).toBeDefined();
    expect(Object.keys(result?.targets ?? {})).not.toContain(
      "active_athletes_count"
    );
  });

  it("accepts an idempotent replay with all five canonical metrics plus extras", async () => {
    mocks.rows.auditLog = [
      {
        organizationId,
        idempotencyKey: `academy-targets:${command.idempotencyKey}`,
        targetId: profileId,
      },
    ];
    mocks.rows.benchmarkProfiles = [
      {
        id: profileId,
        organizationId,
        key: "academy_internal_targets",
        status: "active",
        version: 1,
        currency: "GBP",
      },
    ];
    mocks.rows.organizations = [{ id: organizationId, defaultCurrency: "EUR" }];
    mocks.rows.locations = [
      { id: authorizationLocationId, organizationId, isActive: true },
    ];
    mocks.rows.benchmarkMetricTargets = [
      ...targetRows(canonicalTargets),
      ...targetRows([["active_athletes_count", 120]], profileId),
      ...targetRows([["collection_rate", 0.85]], profileId, "EUR"),
    ];

    const result = await saveAcademyTargetProfile(command);

    expect(result).toEqual({ profileId, version: 1, replayed: true });
    const targetQuery = mocks.queries.find(
      (query) => query.table === "benchmarkMetricTargets"
    );
    expect(targetQuery?.limit).toBe(6);
    expect(canonicalMetricFilter(targetQuery!)?.[1]).toEqual(
      canonicalTargets.map(([key]) => key)
    );
    expect(profileCurrencyFilter(targetQuery!)).toBeDefined();
  });

  it("rejects an idempotent replay with a missing canonical metric", async () => {
    mocks.rows.auditLog = [
      {
        organizationId,
        idempotencyKey: `academy-targets:${command.idempotencyKey}`,
        targetId: profileId,
      },
    ];
    mocks.rows.benchmarkProfiles = [
      {
        id: profileId,
        organizationId,
        key: "academy_internal_targets",
        status: "active",
        version: 1,
        currency: "GBP",
      },
    ];
    mocks.rows.locations = [
      { id: authorizationLocationId, organizationId, isActive: true },
    ];
    mocks.rows.benchmarkMetricTargets = [
      ...targetRows(canonicalTargets.slice(0, 4)),
      ...targetRows([["active_athletes_count", 120]], profileId),
    ];

    await expect(saveAcademyTargetProfile(command)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    expect(
      mocks.queries.find((query) => query.table === "benchmarkMetricTargets")
        ?.limit
    ).toBe(6);
  });

  it("fails closed when a profile has duplicate NULL-currency targets", async () => {
    mocks.rows.benchmarkProfiles = [
      {
        id: profileId,
        organizationId,
        key: "academy_internal_targets",
        status: "active",
        version: 1,
        currency: "GBP",
      },
    ];
    mocks.rows.benchmarkMetricTargets = [
      ...targetRows(canonicalTargets),
      ...targetRows([["class_fill_rate", 0.7]]),
    ];

    await expect(getAcademyTargetProfile(organizationId)).rejects.toMatchObject(
      {
        code: "INVALID_RELATION",
        status: 422,
      }
    );
    expect(
      mocks.queries.find((query) => query.table === "benchmarkMetricTargets")
        ?.limit
    ).toBe(6);
  });

  it("rejects a replay with five rows if one canonical key is duplicated", async () => {
    mocks.rows.auditLog = [
      {
        organizationId,
        idempotencyKey: `academy-targets:${command.idempotencyKey}`,
        targetId: profileId,
      },
    ];
    mocks.rows.benchmarkProfiles = [
      {
        id: profileId,
        organizationId,
        key: "academy_internal_targets",
        status: "active",
        version: 1,
        currency: "GBP",
      },
    ];
    mocks.rows.locations = [
      { id: authorizationLocationId, organizationId, isActive: true },
    ];
    mocks.rows.benchmarkMetricTargets = [
      ...targetRows([
        ["class_fill_rate", 0.7],
        ["class_fill_rate", 0.7],
        ["cohort_retention_rate", 0.8],
        ["churn_rate", 0.2],
        ["collection_rate", 0.9],
      ]),
    ];

    await expect(saveAcademyTargetProfile(command)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
  });

  it("keeps organization authorization before reading target rows", async () => {
    mocks.assertOperationalAccess.mockRejectedValue(new Error("forbidden"));

    await expect(saveAcademyTargetProfile(command)).rejects.toThrow(
      "forbidden"
    );

    expect(mocks.assertOperationalAccess).toHaveBeenCalledWith(
      mocks.transaction,
      expect.objectContaining({ organizationId })
    );
    expect(
      mocks.queries.some((query) => query.table === "benchmarkMetricTargets")
    ).toBe(false);
  });

  it("fails closed when the historical profile currency is missing", async () => {
    mocks.rows.benchmarkProfiles = [
      {
        id: profileId,
        organizationId,
        key: "academy_internal_targets",
        status: "active",
        version: 1,
        currency: null,
      },
    ];

    await expect(getAcademyTargetProfile(organizationId)).rejects.toMatchObject(
      {
        code: "INVALID_RELATION",
        status: 422,
      }
    );
    expect(
      mocks.queries.some((query) => query.table === "benchmarkMetricTargets")
    ).toBe(false);
  });
});
