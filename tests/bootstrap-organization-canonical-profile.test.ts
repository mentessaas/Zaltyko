import { beforeEach, describe, expect, it, vi } from "vitest";

const { fixture, testTables } = vi.hoisted(() => {
  const names = [
    "locations",
    "organizationBootstrapCommands",
    "organizationMembers",
    "organizationSports",
    "organizations",
    "programs",
    "sportProfiles",
  ];
  const testTables = Object.fromEntries(
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
    fixture: {
      rows: {} as Record<string, Record<string, unknown>[]>,
      tx: undefined as unknown,
      selectCalls: [] as Array<{
        table: string;
        where: unknown;
        limit: number | null;
      }>,
      inserts: [] as Array<{ table: string; values: unknown }>,
      executeCalls: [] as string[],
      hasLegacyMembership: false,
      legacySchemaState: "absent" as "absent" | "present" | "partial" | "error",
    },
    testTables,
  };
});

vi.mock("@/db/zaltyko-schema", () => testTables);
vi.mock("@/db", () => ({
  db: {
    transaction: (callback: (tx: unknown) => unknown) => callback(fixture.tx),
  },
}));
vi.mock("@/modules/shared/infrastructure/transactional-records", () => ({
  appendAuditEntry: vi.fn(),
  appendOutboxEvent: vi.fn(),
}));
vi.mock("drizzle-orm", () => {
  const condition =
    (op: string) =>
    (...args: unknown[]) => ({ op, args });
  return {
    and: condition("and"),
    asc: (column: unknown) => ({ op: "asc", column }),
    eq: condition("eq"),
    inArray: condition("inArray"),
    sql: Object.assign(
      (parts: TemplateStringsArray, ...values: unknown[]) => ({
        parts,
        values,
      }),
      { join: (values: unknown[]) => values }
    ),
  };
});

import { bootstrapOrganization } from "@/modules/organizations/application/bootstrap-organization";

type Predicate = { op: string; args: unknown[] };
type Row = Record<string, unknown>;

function matches(predicate: unknown, row: Row): boolean {
  if (!predicate || typeof predicate !== "object") return true;
  const node = predicate as Predicate;
  if (node.op === "and") return node.args.every((item) => matches(item, row));
  const [column, value] = node.args as [{ columnName: string }, unknown];
  const actual = row[column.columnName];
  if (node.op === "eq") return actual === value;
  if (node.op === "inArray") return (value as unknown[]).includes(actual);
  return true;
}

function makeTx() {
  let nextId = 0;
  const tx = {
    execute: vi.fn(async (statement: unknown) => {
      const parts =
        statement && typeof statement === "object" && "parts" in statement
          ? (statement as { parts: string[] }).parts
          : [];
      const sqlText = parts.join("");
      fixture.executeCalls.push(sqlText);
      if (sqlText.includes("to_regclass")) {
        if (fixture.legacySchemaState === "error") {
          throw new Error("catalog permission denied");
        }
        return {
          rows: [
            {
              profiles_present:
                fixture.legacySchemaState === "present" ||
                fixture.legacySchemaState === "partial",
              academies_present: fixture.legacySchemaState === "present",
              memberships_present:
                fixture.legacySchemaState === "present" ||
                fixture.legacySchemaState === "partial",
            },
          ],
        };
      }
      return {
        rows:
          fixture.hasLegacyMembership &&
          sqlText.includes("from public.profiles")
            ? [{ exists: 1 }]
            : [],
      };
    }),
    select: vi.fn(() => {
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
          resolve: (rows: Row[]) => unknown,
          reject?: (reason: unknown) => unknown
        ) => {
          fixture.selectCalls.push({ table, where, limit });
          const rows = (fixture.rows[table] ?? []).filter((row) =>
            matches(where, row)
          );
          return Promise.resolve(
            limit === null ? rows : rows.slice(0, limit)
          ).then(resolve, reject);
        },
      };
      return query;
    }),
    insert: vi.fn((target: { tableName: string }) => {
      let values: unknown;
      const builder: {
        values: (nextValues: unknown) => typeof builder;
        returning: (projection: Record<string, unknown>) => Promise<Row[]>;
        then: (
          resolve: (value: Row[]) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise<unknown>;
      } = {
        values: (nextValues) => {
          values = nextValues;
          fixture.inserts.push({ table: target.tableName, values });
          return builder;
        },
        returning: () => {
          if (target.tableName === "organizationSports") {
            return Promise.resolve(
              (values as Row[]).map((row) => ({
                id: `organization-sport-${++nextId}`,
                sportProfileId: row.sportProfileId,
              }))
            );
          }
          return Promise.resolve([
            {
              id:
                target.tableName === "organizations"
                  ? "organization-created"
                  : target.tableName === "locations"
                    ? "location-created"
                    : "owner-member-created",
            },
          ]);
        },
        then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
      };
      return builder;
    }),
  };
  return tx;
}

const command = {
  organizationName: "Academia de prueba",
  countryCode: "ES",
  locationName: "Sede principal",
  primaryDiscipline: "artistic" as const,
  additionalDisciplines: ["rhythmic" as const],
  complementaryActivities: [],
  userId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "bootstrap-canonical-profile-001",
};

describe("organization bootstrap canonical sport profiles", () => {
  beforeEach(() => {
    fixture.rows = {
      organizationBootstrapCommands: [],
      organizationMembers: [],
      sportProfiles: [],
    };
    fixture.selectCalls = [];
    fixture.inserts = [];
    fixture.executeCalls = [];
    fixture.hasLegacyMembership = false;
    fixture.legacySchemaState = "absent";
    fixture.tx = makeTx();
  });

  it("uses one unconfigured identity profile per requested discipline", async () => {
    fixture.legacySchemaState = "present";
    fixture.rows.sportProfiles = [
      {
        id: "configured-artistic-profile",
        countryCode: "ES",
        disciplineKey: "artistic",
        federationCode: "rfeg",
        profileVersion: "identity-v1",
        status: "verified",
      },
      {
        id: "canonical-rhythmic-profile",
        countryCode: "ES",
        disciplineKey: "rhythmic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
      },
      {
        id: "other-country-profile",
        countryCode: "FR",
        disciplineKey: "artistic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
      },
      {
        id: "canonical-artistic-profile",
        countryCode: "ES",
        disciplineKey: "artistic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
      },
      {
        id: "other-version-profile",
        countryCode: "ES",
        disciplineKey: "rhythmic",
        federationCode: "unconfigured",
        profileVersion: "rules-v2",
        status: "verified",
      },
    ];

    const result = await bootstrapOrganization(command);

    expect(result).toEqual({
      organizationId: "organization-created",
      locationId: "location-created",
      memberId: "owner-member-created",
    });
    const profileQuery = fixture.selectCalls.find(
      (call) => call.table === "sportProfiles"
    );
    expect(profileQuery?.limit).toBe(2);
    const organizationSports = fixture.inserts.find(
      (insert) => insert.table === "organizationSports"
    )?.values as Row[];
    expect(organizationSports).toEqual([
      {
        organizationId: "organization-created",
        countryCode: "ES",
        sportProfileId: "canonical-artistic-profile",
        role: "primary",
        status: "active",
      },
      {
        organizationId: "organization-created",
        countryCode: "ES",
        sportProfileId: "canonical-rhythmic-profile",
        role: "additional",
        status: "active",
      },
    ]);
  });

  it("fails closed when a requested canonical profile is missing", async () => {
    fixture.rows.sportProfiles = [
      {
        id: "configured-artistic-profile",
        countryCode: "ES",
        disciplineKey: "artistic",
        federationCode: "rfeg",
        profileVersion: "identity-v1",
        status: "verified",
      },
      {
        id: "canonical-rhythmic-profile",
        countryCode: "ES",
        disciplineKey: "rhythmic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
      },
    ];

    await expect(bootstrapOrganization(command)).rejects.toMatchObject({
      code: "INVALID_RELATION",
      status: 422,
    });
    expect(fixture.inserts).toEqual([]);
  });

  it("blocks direct service calls for an account with legacy academy membership", async () => {
    fixture.hasLegacyMembership = true;
    fixture.legacySchemaState = "present";

    await expect(bootstrapOrganization(command)).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
      status: 409,
      details: { reason: "legacy-academy-link-required" },
    });

    expect(fixture.inserts).toEqual([]);
    expect(
      fixture.executeCalls.some((sqlText) =>
        sqlText.includes("public.memberships")
      )
    ).toBe(true);
    expect(
      fixture.selectCalls.some((call) => call.table === "organizationMembers")
    ).toBe(false);
  });

  it("no consulta tablas legacy ausentes dentro de la transacción canónica", async () => {
    fixture.legacySchemaState = "absent";
    fixture.rows.sportProfiles = [
      {
        id: "canonical-artistic-profile",
        countryCode: "ES",
        disciplineKey: "artistic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
      },
      {
        id: "canonical-rhythmic-profile",
        countryCode: "ES",
        disciplineKey: "rhythmic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
      },
    ];

    await bootstrapOrganization(command);

    expect(
      fixture.executeCalls.some((sqlText) =>
        sqlText.includes("from public.profiles")
      )
    ).toBe(false);
  });

  it("falla cerrado con schema legacy parcial o sin permiso de catálogo", async () => {
    fixture.legacySchemaState = "partial";
    await expect(bootstrapOrganization(command)).rejects.toThrow(
      "está incompleto"
    );
    expect(fixture.inserts).toEqual([]);
    expect(
      fixture.executeCalls.some((sqlText) =>
        sqlText.includes("from public.profiles")
      )
    ).toBe(false);

    fixture.executeCalls = [];
    fixture.legacySchemaState = "error";
    await expect(bootstrapOrganization(command)).rejects.toThrow(
      "catalog permission denied"
    );
    expect(fixture.inserts).toEqual([]);
    expect(
      fixture.executeCalls.some((sqlText) =>
        sqlText.includes("from public.profiles")
      )
    ).toBe(false);
  });
});
