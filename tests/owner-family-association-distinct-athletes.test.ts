import { beforeEach, describe, expect, it, vi } from "vitest";

const { makeQuery, mocks, tables } = vi.hoisted(() => {
  const names = [
    "athletes",
    "enrollments",
    "families",
    "familyMembers",
    "familyPayers",
    "familyGuardians",
    "guardians",
    "people",
    "locations",
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
  const mocks = {
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    queries: [] as Array<{
      table: string;
      where: unknown;
      joins: unknown[];
      limit: number | null;
      distinct: boolean;
    }>,
    inserts: [] as Array<{ table: string; values: unknown }>,
    assertOperationalAccess: vi.fn(),
    transaction: undefined as unknown,
  };

  function columnValue(row: Record<string, unknown>, column: unknown) {
    if (!column || typeof column !== "object") return column;
    const reference = column as { tableName?: string; columnName?: string };
    if (reference.tableName && reference.columnName) {
      return (
        row[`${reference.tableName}.${reference.columnName}`] ??
        row[reference.columnName]
      );
    }
    return column;
  }

  function matches(predicate: unknown, row: Record<string, unknown>): boolean {
    if (!predicate || typeof predicate !== "object") return true;
    const node = predicate as { op?: string; args?: unknown[] };
    const args = node.args ?? [];
    if (node.op === "and") return args.every((item) => matches(item, row));
    if (node.op === "or") return args.some((item) => matches(item, row));
    const [column, value] = args;
    const actual = columnValue(row, column);
    const expected = columnValue(row, value);
    if (node.op === "eq") return actual === expected;
    if (node.op === "inArray") return (value as unknown[]).includes(actual);
    if (node.op === "isNull") return actual === null;
    if (node.op === "lte") return String(actual) <= String(expected);
    if (node.op === "gte") return String(actual) >= String(expected);
    return true;
  }

  function makeQuery(projection?: Record<string, unknown>, distinct = false) {
    let table = "";
    let where: unknown;
    let limit: number | null = null;
    const joins: unknown[] = [];
    const query = {
      from: (source: { tableName: string }) => {
        table = source.tableName;
        return query;
      },
      innerJoin: (_source: unknown, predicate: unknown) => {
        joins.push(predicate);
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
        mocks.queries.push({ table, where, joins, limit, distinct });
        let result = (mocks.rows[table] ?? []).filter(
          (row) =>
            matches(where, row) &&
            joins.every((predicate) => matches(predicate, row))
        );
        if (projection) {
          result = result.map((row) =>
            Object.fromEntries(
              Object.entries(projection).map(([key, column]) => [
                key,
                columnValue(row, column),
              ])
            )
          );
        }
        if (distinct) {
          const key = projection ? Object.keys(projection)[0] : "id";
          result = [...new Map(result.map((row) => [row[key], row])).values()];
        }
        if (limit !== null) result = result.slice(0, limit);
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  }

  return { makeQuery, mocks, tables };
});

vi.mock("@/db/zaltyko-schema", () => tables);
vi.mock("@/db", () => ({
  db: {
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
  assertIdempotencyPayload: vi.fn(),
  findOutboxEvent: vi.fn().mockResolvedValue(null),
  lockCommand: vi.fn(),
}));
vi.mock("drizzle-orm", () => {
  const condition =
    (op: string) =>
    (...args: unknown[]) => ({ op, args });
  const sql = Object.assign(
    (parts: TemplateStringsArray, ...values: unknown[]) => ({ parts, values }),
    { join: (values: unknown[]) => values }
  );
  return {
    and: condition("and"),
    eq: condition("eq"),
    gte: condition("gte"),
    inArray: condition("inArray"),
    isNull: condition("isNull"),
    lte: condition("lte"),
    or: condition("or"),
    sql,
  };
});

import { associateOwnerFamilyInTransaction } from "@/modules/families/application/owner-family-association";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";
const locationId = "33333333-3333-4333-8333-333333333333";
const otherLocationId = "44444444-4444-4444-8444-444444444444";
const familyId = "55555555-5555-4555-8555-555555555555";
const familyPayerId = "66666666-6666-4666-8666-666666666666";
const guardianId = "77777777-7777-4777-8777-777777777777";
const userId = "88888888-8888-4888-8888-888888888888";
const memberId = "99999999-9999-4999-8999-999999999999";
const athleteOneId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const athleteTwoId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const athleteThreeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function athleteEnrollmentRow(
  athleteId: string,
  options: {
    athleteOrganizationId?: string;
    enrollmentOrganizationId?: string;
    enrollmentAthleteId?: string;
    active?: boolean;
    enrollmentLocationId?: string;
    status?: string;
  } = {}
) {
  return {
    "athletes.id": athleteId,
    "athletes.organizationId": options.athleteOrganizationId ?? organizationId,
    "athletes.isActive": options.active ?? true,
    "enrollments.organizationId":
      options.enrollmentOrganizationId ?? organizationId,
    "enrollments.athleteId": options.enrollmentAthleteId ?? athleteId,
    "enrollments.locationId": options.enrollmentLocationId ?? locationId,
    "enrollments.status": options.status ?? "active",
  };
}

function payerRow() {
  return {
    id: familyPayerId,
    guardianId,
    organizationId,
    familyId,
    startsOn: "2026-01-01",
    endsOn: null,
    isPrimary: true,
    "familyPayers.id": familyPayerId,
    "familyPayers.guardianId": guardianId,
    "familyPayers.organizationId": organizationId,
    "familyPayers.familyId": familyId,
    "familyPayers.startsOn": "2026-01-01",
    "familyPayers.endsOn": null,
    "familyPayers.isPrimary": true,
    "familyGuardians.organizationId": organizationId,
    "familyGuardians.familyId": familyId,
    "familyGuardians.guardianId": guardianId,
    "familyGuardians.isActive": true,
    "guardians.organizationId": organizationId,
    "guardians.id": guardianId,
    "guardians.isActive": true,
  };
}

function makeTransaction() {
  const tx = {
    select: (projection?: Record<string, unknown>) => makeQuery(projection),
    selectDistinct: (projection?: Record<string, unknown>) =>
      makeQuery(projection, true),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: (target: { tableName: string }) => {
      let values: unknown;
      const builder = {
        values: (nextValues: unknown) => {
          values = nextValues;
          mocks.inserts.push({ table: target.tableName, values });
          return builder;
        },
        returning: () => Promise.resolve([{ id: "created" }]),
        then: (
          resolve: (result: unknown[]) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve([]).then(resolve, reject),
      };
      return builder;
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    })),
  };
  return tx;
}

const command = (athleteIds: string[]) => ({
  organizationId,
  locationId,
  familyId,
  athleteIds,
  effectiveFrom: "2026-10-01",
  payer: { familyPayerId },
  idempotencyKey: "family-association-distinct-athletes-001",
  actor: { userId, memberId },
});

function makeAssociationRows(athleteRows: Array<Record<string, unknown>>) {
  mocks.rows = {
    athletes: athleteRows,
    families: [{ id: familyId, organizationId, isActive: true }],
    familyMembers: [],
    familyPayers: [payerRow()],
  };
}

describe("owner family association verifies distinct athletes", () => {
  beforeEach(() => {
    mocks.rows = {};
    mocks.queries = [];
    mocks.inserts = [];
    mocks.assertOperationalAccess.mockReset().mockResolvedValue(undefined);
    mocks.transaction = makeTransaction();
  });

  it("does not let two class enrollments for one athlete hide the second athlete", async () => {
    makeAssociationRows([
      athleteEnrollmentRow(athleteOneId),
      athleteEnrollmentRow(athleteOneId),
      athleteEnrollmentRow(athleteTwoId),
    ]);

    const result = await associateOwnerFamilyInTransaction(
      mocks.transaction as never,
      command([athleteOneId, athleteTwoId])
    );

    expect(result.family.id).toBe(familyId);
    const verificationQuery = mocks.queries.find(
      (query) => query.table === "athletes"
    );
    expect(verificationQuery?.distinct).toBe(true);
    expect(verificationQuery?.limit).toBe(2);
    expect(
      mocks.inserts
        .filter((insert) => insert.table === "familyMembers")
        .map((insert) => (insert.values as { athleteId: string }).athleteId)
        .sort()
    ).toEqual([athleteOneId, athleteTwoId].sort());
  });

  it.each([
    ["sin inscripción", []],
    [
      "atleta inactiva",
      [athleteEnrollmentRow(athleteThreeId, { active: false })],
    ],
    [
      "otra organización",
      [
        athleteEnrollmentRow(athleteThreeId, {
          athleteOrganizationId: otherOrganizationId,
          enrollmentOrganizationId: otherOrganizationId,
        }),
      ],
    ],
    [
      "otra sede",
      [
        athleteEnrollmentRow(athleteThreeId, {
          enrollmentLocationId: otherLocationId,
        }),
      ],
    ],
    [
      "inscripción inactiva",
      [athleteEnrollmentRow(athleteThreeId, { status: "cancelled" })],
    ],
  ])("rechaza atleta %s", async (_reason, rows) => {
    makeAssociationRows(rows);

    await expect(
      associateOwnerFamilyInTransaction(
        mocks.transaction as never,
        command([athleteThreeId])
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(mocks.inserts).toEqual([]);
  });
});
