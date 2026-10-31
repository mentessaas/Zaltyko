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
    "groupMemberships",
    "groups",
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
    if (node.op === "notInArray") return !(value as unknown[]).includes(actual);
    if (node.op === "isNull") return actual === null;
    if (node.op === "lte") return String(actual) <= String(expected);
    if (node.op === "gte") return String(actual) >= String(expected);
    if (node.op === "gt") return String(actual) > String(expected);
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
          result = [...new Map(result.map((row) => [JSON.stringify(row), row])).values()];
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
    gt: condition("gt"),
    gte: condition("gte"),
    inArray: condition("inArray"),
    isNull: condition("isNull"),
    lte: condition("lte"),
    notInArray: condition("notInArray"),
    or: condition("or"),
    sql,
  };
});

import {
  associateOwnerFamilyInTransaction,
  getOwnerFamilyOptions,
} from "@/modules/families/application/owner-family-association";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";
const locationId = "33333333-3333-4333-8333-333333333333";
const otherLocationId = "44444444-4444-4444-8444-444444444444";
const familyId = "55555555-5555-4555-8555-555555555555";
const familyPayerId = "66666666-6666-4666-8666-666666666666";
const secondaryFamilyPayerId = "66666666-6666-4666-8666-666666666667";
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

function payerRow(options: {
  id?: string;
  guardianId?: string;
  isPrimary?: boolean;
} = {}) {
  const id = options.id ?? familyPayerId;
  const rowGuardianId = options.guardianId ?? guardianId;
  const isPrimary = options.isPrimary ?? true;
  return {
    id,
    guardianId: rowGuardianId,
    organizationId,
    familyId,
    startsOn: "2026-01-01",
    endsOn: null,
    isPrimary,
    "familyPayers.id": id,
    "familyPayers.guardianId": rowGuardianId,
    "familyPayers.organizationId": organizationId,
    "familyPayers.familyId": familyId,
    "familyPayers.startsOn": "2026-01-01",
    "familyPayers.endsOn": null,
    "familyPayers.isPrimary": isPrimary,
    "familyGuardians.organizationId": organizationId,
    "familyGuardians.familyId": familyId,
    "familyGuardians.guardianId": rowGuardianId,
    "familyGuardians.isActive": true,
    "guardians.organizationId": organizationId,
    "guardians.id": rowGuardianId,
    "guardians.isActive": true,
  };
}

function familyMemberRow(options: {
  id?: string;
  familyId?: string;
  athleteId?: string;
  startsOn?: string;
  endsOn?: string | null;
} = {}) {
  const id = options.id ?? "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const rowFamilyId = options.familyId ?? familyId;
  const rowAthleteId = options.athleteId ?? athleteOneId;
  const startsOn = options.startsOn ?? "2026-09-01";
  const endsOn = options.endsOn ?? null;
  return {
    id,
    organizationId,
    familyId: rowFamilyId,
    athleteId: rowAthleteId,
    startsOn,
    endsOn,
    "familyMembers.id": id,
    "familyMembers.organizationId": organizationId,
    "familyMembers.familyId": rowFamilyId,
    "familyMembers.athleteId": rowAthleteId,
    "familyMembers.startsOn": startsOn,
    "familyMembers.endsOn": endsOn,
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

function makeAssociationRows(
  athleteRows: Array<Record<string, unknown>>,
  payerRows: Array<Record<string, unknown>> = [payerRow()]
) {
  mocks.rows = {
    athletes: athleteRows,
    families: [{ id: familyId, organizationId, isActive: true }],
    familyMembers: [],
    familyPayers: payerRows,
  };
}

function athleteGroupMembershipRow(
  athleteId: string,
  options: {
    athleteOrganizationId?: string;
    membershipOrganizationId?: string;
    groupOrganizationId?: string;
    groupAthleteId?: string;
    groupId?: string;
    membershipStatus?: string;
    membershipStartsOn?: string;
    membershipEndsOn?: string | null;
    groupLocationId?: string;
    groupStatus?: string;
    active?: boolean;
  } = {}
) {
  const groupId = options.groupId ?? "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  return {
    "athletes.id": athleteId,
    "athletes.organizationId": options.athleteOrganizationId ?? organizationId,
    "athletes.isActive": options.active ?? true,
    "groupMemberships.organizationId": options.membershipOrganizationId ?? organizationId,
    "groupMemberships.athleteId": options.groupAthleteId ?? athleteId,
    "groupMemberships.groupId": groupId,
    "groupMemberships.status": options.membershipStatus ?? "active",
    "groupMemberships.startsOn": options.membershipStartsOn ?? "2026-09-01",
    "groupMemberships.endsOn": options.membershipEndsOn ?? null,
    "groups.organizationId": options.groupOrganizationId ?? organizationId,
    "groups.id": groupId,
    "groups.locationId": options.groupLocationId ?? locationId,
    "groups.status": options.groupStatus ?? "active",
  };
}

describe("owner family association verifies distinct athletes", () => {
  beforeEach(() => {
    mocks.rows = {};
    mocks.queries = [];
    mocks.inserts = [];
    mocks.assertOperationalAccess
      .mockReset()
      .mockResolvedValue({ locationScopeMode: "all" });
    mocks.transaction = makeTransaction();
  });

  it("deduplicates a family athlete found through enrollment and multiple active groups", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const personId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const firstGroupId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const secondGroupId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const familyMemberRow = (groupId: string) => ({
      "families.id": familyId,
      "families.organizationId": organizationId,
      "families.isActive": true,
      "familyMembers.organizationId": organizationId,
      "familyMembers.familyId": familyId,
      "familyMembers.athleteId": athleteOneId,
      "familyMembers.startsOn": today,
      "familyMembers.endsOn": null,
      "athletes.organizationId": organizationId,
      "athletes.id": athleteOneId,
      "athletes.isActive": true,
      "athletes.personId": personId,
      "people.organizationId": organizationId,
      "people.id": personId,
      "people.givenName": "Ada",
      "people.familyName": "Gimnasta",
      "groupMemberships.organizationId": organizationId,
      "groupMemberships.athleteId": athleteOneId,
      "groupMemberships.groupId": groupId,
      "groupMemberships.status": "active",
      "groupMemberships.startsOn": today,
      "groupMemberships.endsOn": null,
      "groups.organizationId": organizationId,
      "groups.id": groupId,
      "groups.locationId": locationId,
      "groups.status": "active",
      "enrollments.organizationId": organizationId,
      "enrollments.athleteId": athleteOneId,
      "enrollments.locationId": locationId,
      "enrollments.status": "active",
    });
    mocks.rows = {
      locations: [{ organizationId, id: locationId, isActive: true, timezone: "UTC" }],
      families: [familyMemberRow(firstGroupId), familyMemberRow(secondGroupId)],
      familyPayers: [],
    };

    const result = await getOwnerFamilyOptions({
      organizationId,
      locationId,
      actor: { userId, memberId },
    });

    expect(result.families).toHaveLength(1);
    expect(result.families[0]?.familyId).toBe(familyId);
    expect(result.families[0]?.athletes.map((athlete) => athlete.athleteId)).toEqual([
      athleteOneId,
    ]);
  });

  it("fails explicitly when the family options query would be truncated at its hard limit", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = Array.from({ length: 1001 }, (_, index) => {
      const suffix = index.toString(16).padStart(12, "0");
      const family = `10000000-0000-4000-8000-${suffix}`;
      const athlete = `20000000-0000-4000-8000-${suffix}`;
      const person = `30000000-0000-4000-8000-${suffix}`;
      return {
        "families.id": family,
        "families.organizationId": organizationId,
        "families.isActive": true,
        "familyMembers.organizationId": organizationId,
        "familyMembers.familyId": family,
        "familyMembers.athleteId": athlete,
        "familyMembers.startsOn": today,
        "familyMembers.endsOn": null,
        "athletes.organizationId": organizationId,
        "athletes.id": athlete,
        "athletes.isActive": true,
        "athletes.personId": person,
        "people.organizationId": organizationId,
        "people.id": person,
        "people.givenName": "Ada",
        "people.familyName": "Gimnasta",
        "enrollments.organizationId": organizationId,
        "enrollments.athleteId": athlete,
        "enrollments.locationId": locationId,
        "enrollments.status": "active",
      };
    });
    mocks.rows = {
      locations: [{ organizationId, id: locationId, isActive: true, timezone: "UTC" }],
      families: rows,
      familyPayers: [],
    };

    await expect(
      getOwnerFamilyOptions({
        organizationId,
        locationId,
        actor: { userId, memberId },
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
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

  it("accepts an active group relationship at this site without enrollment and deduplicates groups", async () => {
    makeAssociationRows([
      athleteGroupMembershipRow(athleteOneId),
      athleteGroupMembershipRow(athleteOneId, {
        groupId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      }),
    ]);

    const result = await associateOwnerFamilyInTransaction(
      mocks.transaction as never,
      command([athleteOneId])
    );

    expect(result.family.id).toBe(familyId);
    const verificationQuery = mocks.queries.find(
      (query) => query.table === "athletes" && query.distinct
    );
    expect(verificationQuery?.distinct).toBe(true);
    expect(verificationQuery?.limit).toBe(1);
    expect(
      mocks.inserts
        .filter((insert) => insert.table === "familyMembers")
        .map((insert) => (insert.values as { athleteId: string }).athleteId)
    ).toEqual([athleteOneId]);
  });

  it.each([
    ["an open relationship scheduled to start later", "2026-11-01", null],
    ["a relationship ending on the effective date", "2026-09-01", "2026-10-01"],
  ])("blocks an overlapping relationship in another family (%s) before writes", async (_label, startsOn, endsOn) => {
    makeAssociationRows([athleteEnrollmentRow(athleteOneId)]);
    mocks.rows.familyMembers = [
      familyMemberRow({
        familyId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        startsOn,
        endsOn,
      }),
    ];

    await expect(
      associateOwnerFamilyInTransaction(
        mocks.transaction as never,
        command([athleteOneId])
      )
    ).rejects.toMatchObject({
      code: "FAMILY_MEMBERSHIP_DATE_CONFLICT",
      status: 409,
      message: "La gimnasta ya tiene una asociación familiar que se solapa con la fecha efectiva.",
    });
    expect(mocks.inserts).toEqual([]);
  });

  it("allows an association after another family's relationship ended before the effective date", async () => {
    makeAssociationRows([athleteEnrollmentRow(athleteOneId)]);
    mocks.rows.familyMembers = [
      familyMemberRow({
        familyId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        startsOn: "2026-09-01",
        endsOn: "2026-09-30",
      }),
    ];

    const result = await associateOwnerFamilyInTransaction(
      mocks.transaction as never,
      command([athleteOneId])
    );

    expect(result.replayed).toBe(false);
    expect(
      mocks.inserts
        .filter((insert) => insert.table === "familyMembers")
        .map((insert) => (insert.values as { athleteId: string }).athleteId)
    ).toEqual([athleteOneId]);
  });

  it("rejects promoting an existing secondary payer without confirmation before any writes", async () => {
    makeAssociationRows(
      [athleteEnrollmentRow(athleteOneId)],
      [
        payerRow(),
        payerRow({
          id: secondaryFamilyPayerId,
          guardianId: "77777777-7777-4777-8777-777777777778",
          isPrimary: false,
        }),
      ]
    );
    const tx = mocks.transaction as { update: ReturnType<typeof vi.fn> };

    await expect(
      associateOwnerFamilyInTransaction(mocks.transaction as never, {
        ...command([athleteOneId]),
        payer: { familyPayerId: secondaryFamilyPayerId },
      })
    ).rejects.toMatchObject({
      code: "PRIMARY_PAYER_CONFIRMATION_REQUIRED",
      status: 422,
      details: { field: "payer.confirmPrimaryPayerChange" },
    });

    expect(mocks.inserts).toEqual([]);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("promotes a selected secondary payer when the request confirms the change", async () => {
    makeAssociationRows(
      [athleteEnrollmentRow(athleteOneId)],
      [
        payerRow(),
        payerRow({
          id: secondaryFamilyPayerId,
          guardianId: "77777777-7777-4777-8777-777777777778",
          isPrimary: false,
        }),
      ]
    );
    const tx = mocks.transaction as { update: ReturnType<typeof vi.fn> };

    await expect(
      associateOwnerFamilyInTransaction(mocks.transaction as never, {
        ...command([athleteOneId]),
        payer: {
          familyPayerId: secondaryFamilyPayerId,
          confirmPrimaryPayerChange: true,
        },
      })
    ).resolves.toMatchObject({
      family: { id: familyId },
      familyPayerId: secondaryFamilyPayerId,
      replayed: false,
    });

    expect(tx.update).toHaveBeenCalled();
  });

  it("requires confirmation before replacing an existing family's primary with a new payer", async () => {
    makeAssociationRows([athleteEnrollmentRow(athleteOneId)]);
    const commandWithNewPayer = {
      ...command([athleteOneId]),
      payer: {
        givenName: "Ada",
        familyName: "Tutora",
        relationship: "parent" as const,
      },
    };
    const tx = mocks.transaction as { update: ReturnType<typeof vi.fn> };

    await expect(
      associateOwnerFamilyInTransaction(mocks.transaction as never, commandWithNewPayer)
    ).rejects.toMatchObject({
      code: "PRIMARY_PAYER_CONFIRMATION_REQUIRED",
      status: 422,
    });

    expect(mocks.inserts).toEqual([]);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it.each([
    ["paused membership", { membershipStatus: "paused" }],
    ["future membership", { membershipStartsOn: "2026-11-01" }],
    ["membership ended before the effective date", { membershipEndsOn: "2026-09-30" }],
    ["inactive group", { groupStatus: "archived" }],
    ["group at another site", { groupLocationId: otherLocationId }],
    ["cross-organization membership", { membershipOrganizationId: otherOrganizationId }],
    ["cross-organization group", { groupOrganizationId: otherOrganizationId }],
  ] as const)("rejects group-only association with %s", async (_reason, options) => {
    makeAssociationRows([
      athleteGroupMembershipRow(athleteThreeId, options),
    ]);

    await expect(
      associateOwnerFamilyInTransaction(
        mocks.transaction as never,
        command([athleteThreeId])
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(mocks.inserts).toEqual([]);
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
