import { createHash } from "node:crypto";

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
      generalProvisionerInstalled: false,
      provisionCalls: [] as Array<{ countryCode: unknown; discipline: unknown }>,
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
  if (node.op === "eq") {
    if (actual === value) return true;
    return (
      column.columnName === "configuration" &&
      typeof value === "object" &&
      value !== null &&
      JSON.stringify(actual) === JSON.stringify(value)
    );
  }
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
      if (sqlText.includes("to_regprocedure")) {
        return { rows: [{ available: fixture.generalProvisionerInstalled }] };
      }
      if (sqlText.includes("ensure_general_identity_sport_profile")) {
        // Simula la función del candidato: crea el perfil vacío solo si falta.
        const [countryCode, discipline] = (
          statement as { values: unknown[] }
        ).values;
        fixture.provisionCalls.push({ countryCode, discipline });
        const profiles = (fixture.rows.sportProfiles ??= []);
        const existing = profiles.find(
          (row) =>
            row.countryCode === countryCode &&
            row.disciplineKey === discipline &&
            row.federationCode === "unconfigured" &&
            row.profileVersion === "identity-v1"
        );
        if (!existing) {
          profiles.push({
            id: `general-${String(countryCode)}-${String(discipline)}`,
            countryCode,
            disciplineKey: discipline,
            federationCode: "unconfigured",
            profileVersion: "identity-v1",
            status: "identity_only",
            configurationSchemaVersion: 1,
            configuration: {},
          });
        }
        return { rows: [{ id: existing?.id ?? `general-${String(countryCode)}-${String(discipline)}` }] };
      }
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

const mexicoCommand = {
  ...command,
  countryCode: "MX",
  idempotencyKey: "bootstrap-mexico-profile-001",
  timezone: "America/Tijuana",
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
    fixture.generalProvisionerInstalled = false;
    fixture.provisionCalls = [];
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
      administrativeMarket: {
        countryCode: "ES",
        defaultCurrency: "EUR",
        timezone: "Europe/Madrid",
      },
      sportCoverage: {
        mode: "discipline_identity",
        message:
          "La academia puede elegir artística y rítmica. El perfil de identidad no activa por sí solo requisitos federativos.",
      },
    });
    const bootstrapCommand = fixture.inserts.find(
      (insert) => insert.table === "organizationBootstrapCommands"
    )?.values as Row;
    const historicalHash = createHash("sha256")
      .update(
        JSON.stringify({
          organizationName: "Academia de prueba",
          legalName: null,
          countryCode: "ES",
          defaultCurrency: "EUR",
          timezone: "Europe/Madrid",
          locationName: "Sede principal",
          locationCode: "sede-principal",
          primaryDiscipline: "artistic",
          additionalDisciplines: ["rhythmic"],
          complementaryActivities: [],
          customActivityName: null,
        })
      )
      .digest("hex");
    expect(bootstrapCommand.requestHash).toBe(historicalHash);
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

  it("rechaza códigos fuera del catálogo ISO antes de abrir transacción", async () => {
    for (const countryCode of ["ZZ", "AQ", "XX"]) {
      await expect(
        bootstrapOrganization({
          ...command,
          countryCode,
          defaultCurrency: "EUR",
          timezone: "Europe/Paris",
        })
      ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
    }

    expect(fixture.executeCalls).toEqual([]);
    expect(fixture.selectCalls).toEqual([]);
    expect(fixture.inserts).toEqual([]);
  });

  describe("países del nivel general", () => {
    const franceCommand = {
      ...command,
      countryCode: "FR",
      defaultCurrency: "EUR" as const,
      timezone: "Europe/Paris",
      idempotencyKey: "bootstrap-general-market-001",
    };

    it("exige elegir moneda soportada y una zona del país antes de abrir transacción", async () => {
      await expect(
        bootstrapOrganization({ ...franceCommand, defaultCurrency: undefined })
      ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
      await expect(
        bootstrapOrganization({
          ...franceCommand,
          countryCode: "AR",
          timezone: undefined,
        })
      ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
      await expect(
        bootstrapOrganization({
          ...franceCommand,
          countryCode: "AR",
          timezone: "Europe/Madrid",
        })
      ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
      await expect(
        bootstrapOrganization({
          ...franceCommand,
          defaultCurrency: "USD" as never,
        })
      ).rejects.toBeDefined();

      expect(fixture.executeCalls).toEqual([]);
      expect(fixture.inserts).toEqual([]);
    });

    it("sin el candidato aplicado responde 422 claro y no escribe nada", async () => {
      await expect(bootstrapOrganization(franceCommand)).rejects.toMatchObject({
        code: "FEATURE_NOT_AVAILABLE",
        status: 422,
        details: { reason: "general-market-onboarding-not-enabled" },
      });
      expect(fixture.inserts).toEqual([]);
      expect(fixture.provisionCalls).toEqual([]);
    });

    it("prepara un perfil de identidad vacío por disciplina y da de alta la academia en su país", async () => {
      fixture.generalProvisionerInstalled = true;
      fixture.rows.sportProfiles = [
        {
          id: "es-artistic-profile",
          countryCode: "ES",
          disciplineKey: "artistic",
          federationCode: "unconfigured",
          profileVersion: "identity-v1",
          status: "identity_only",
          configurationSchemaVersion: 1,
          configuration: {},
        },
      ];

      const result = await bootstrapOrganization(franceCommand);

      expect(fixture.provisionCalls).toEqual([
        { countryCode: "FR", discipline: "artistic" },
        { countryCode: "FR", discipline: "rhythmic" },
      ]);
      expect(result.administrativeMarket).toEqual({
        countryCode: "FR",
        defaultCurrency: "EUR",
        timezone: "Europe/Paris",
      });
      expect(result.sportCoverage.mode).toBe("general_country_identity");
      expect(result.sportCoverage.message).toContain(
        "llegarán más adelante"
      );
      expect(
        fixture.inserts.find((insert) => insert.table === "organizations")
          ?.values
      ).toMatchObject({ countryCode: "FR", defaultCurrency: "EUR" });
      expect(
        fixture.inserts.find((insert) => insert.table === "organizationSports")
          ?.values
      ).toEqual([
        {
          organizationId: "organization-created",
          countryCode: "FR",
          sportProfileId: "general-FR-artistic",
          role: "primary",
          status: "active",
        },
        {
          organizationId: "organization-created",
          countryCode: "FR",
          sportProfileId: "general-FR-rhythmic",
          role: "additional",
          status: "active",
        },
      ]);
    });

    it("acepta MXN en un país del nivel general y no reutiliza perfiles de ES ni MX", async () => {
      fixture.generalProvisionerInstalled = true;
      fixture.rows.sportProfiles = [
        {
          id: "mx-artistic-identity-profile",
          countryCode: "MX",
          disciplineKey: "artistic",
          federationCode: "unconfigured",
          profileVersion: "identity-v1",
          status: "identity_only",
          configurationSchemaVersion: 1,
          configuration: {},
        },
      ];

      const result = await bootstrapOrganization({
        ...franceCommand,
        countryCode: "CO",
        defaultCurrency: "MXN",
        timezone: "America/Bogota",
        additionalDisciplines: [],
      });

      expect(result.administrativeMarket).toEqual({
        countryCode: "CO",
        defaultCurrency: "MXN",
        timezone: "America/Bogota",
      });
      expect(
        fixture.inserts.find((insert) => insert.table === "organizationSports")
          ?.values
      ).toEqual([
        {
          organizationId: "organization-created",
          countryCode: "CO",
          sportProfileId: "general-CO-artistic",
          role: "primary",
          status: "active",
        },
      ]);
    });

    it("falla sin escrituras si el perfil del país no tiene la forma de identidad vacía", async () => {
      fixture.generalProvisionerInstalled = true;
      fixture.rows.sportProfiles = [
        {
          id: "fr-artistic-with-rules",
          countryCode: "FR",
          disciplineKey: "artistic",
          federationCode: "unconfigured",
          profileVersion: "identity-v1",
          status: "identity_only",
          configurationSchemaVersion: 1,
          configuration: { rules: ["unexpected"] },
        },
      ];

      await expect(
        bootstrapOrganization({ ...franceCommand, additionalDisciplines: [] })
      ).rejects.toMatchObject({
        code: "INVALID_RELATION",
        status: 422,
        details: { reason: "general-market-identity-profiles-required" },
      });
      expect(fixture.inserts).toEqual([]);
    });

    it("España y México no pasan por el aprovisionamiento general", async () => {
      fixture.generalProvisionerInstalled = true;
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
      await expect(bootstrapOrganization(mexicoCommand)).rejects.toMatchObject({
        details: { reason: "mx-discipline-identity-profiles-required" },
      });

      expect(fixture.provisionCalls).toEqual([]);
      expect(
        fixture.executeCalls.some((sqlText) =>
          sqlText.includes("to_regprocedure")
        )
      ).toBe(false);
    });
  });

  it("usa un perfil de identidad MX por disciplina y conserva cobertura sin reglas", async () => {
    fixture.rows.sportProfiles = [
      {
        id: "mx-artistic-identity-profile",
        countryCode: "MX",
        disciplineKey: "artistic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
        configurationSchemaVersion: 1,
        configuration: {},
      },
      {
        id: "mx-rhythmic-identity-profile",
        countryCode: "MX",
        disciplineKey: "rhythmic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
        configurationSchemaVersion: 1,
        configuration: {},
      },
      {
        id: "es-artistic-profile",
        countryCode: "ES",
        disciplineKey: "artistic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
      },
    ];

    const result = await bootstrapOrganization(mexicoCommand);

    expect(result.administrativeMarket).toEqual({
      countryCode: "MX",
      defaultCurrency: "MXN",
      timezone: "America/Tijuana",
    });
    expect(result.sportCoverage.mode).toBe("general_identity_only");
    expect(result.sportCoverage.message).toContain(
      "no aplica categorías ni requisitos federativos mexicanos"
    );
    expect(
      fixture.inserts.find((insert) => insert.table === "organizations")?.values
    ).toMatchObject({ countryCode: "MX", defaultCurrency: "MXN" });
    expect(
      fixture.inserts.find((insert) => insert.table === "locations")?.values
    ).toMatchObject({ timezone: "America/Tijuana" });

    const organizationSports = fixture.inserts.find(
      (insert) => insert.table === "organizationSports"
    )?.values as Row[];
    expect(organizationSports).toEqual([
      {
        organizationId: "organization-created",
        countryCode: "MX",
        sportProfileId: "mx-artistic-identity-profile",
        role: "primary",
        status: "active",
      },
      {
        organizationId: "organization-created",
        countryCode: "MX",
        sportProfileId: "mx-rhythmic-identity-profile",
        role: "additional",
        status: "active",
      },
    ]);
    const programs = fixture.inserts.find(
      (insert) => insert.table === "programs"
    )?.values as Row[];
    expect(programs.slice(0, 2)).toEqual([
      {
        organizationId: "organization-created",
        name: "Gimnasia artística",
        kind: "gymnastics_sport",
        organizationSportId: "organization-sport-1",
        activityKey: null,
        status: "active",
      },
      {
        organizationId: "organization-created",
        name: "Gimnasia rítmica",
        kind: "gymnastics_sport",
        organizationSportId: "organization-sport-2",
        activityKey: null,
        status: "active",
      },
    ]);
  });

  it("falla sin escrituras si falta identidad MX para una disciplina y no usa perfiles ES ni verificados", async () => {
    fixture.rows.sportProfiles = [
      {
        id: "mx-verified-artistic-profile",
        countryCode: "MX",
        disciplineKey: "artistic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "verified",
        configurationSchemaVersion: 1,
        configuration: {},
      },
      {
        id: "mx-rhythmic-identity-profile",
        countryCode: "MX",
        disciplineKey: "rhythmic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
        configurationSchemaVersion: 1,
        configuration: {},
      },
      {
        id: "es-artistic-profile",
        countryCode: "ES",
        disciplineKey: "artistic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
      },
    ];

    await expect(bootstrapOrganization(mexicoCommand)).rejects.toMatchObject({
      code: "INVALID_RELATION",
      status: 422,
      details: { reason: "mx-discipline-identity-profiles-required" },
    });
    expect(fixture.inserts).toEqual([]);
  });

  it.each([
    {
      label: "una versión de configuración distinta de 1",
      configurationSchemaVersion: 2,
      configuration: {},
    },
    {
      label: "una configuración con reglas",
      configurationSchemaVersion: 1,
      configuration: { rules: ["unexpected"] },
    },
  ])("falla sin escrituras en MX si el perfil identity-only tiene $label", async (invalidShape) => {
    fixture.rows.sportProfiles = [
      {
        id: "mx-artistic-identity-profile",
        countryCode: "MX",
        disciplineKey: "artistic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
        ...invalidShape,
      },
      {
        id: "mx-rhythmic-identity-profile",
        countryCode: "MX",
        disciplineKey: "rhythmic",
        federationCode: "unconfigured",
        profileVersion: "identity-v1",
        status: "identity_only",
        configurationSchemaVersion: 1,
        configuration: {},
      },
    ];

    await expect(bootstrapOrganization(mexicoCommand)).rejects.toMatchObject({
      code: "INVALID_RELATION",
      status: 422,
      details: { reason: "mx-discipline-identity-profiles-required" },
    });
    expect(fixture.inserts).toEqual([]);
  });

  it("exige una zona permitida para México y conserva moneda y zona resueltas en el hash", async () => {
    await expect(
      bootstrapOrganization({ ...mexicoCommand, timezone: undefined })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
    await expect(
      bootstrapOrganization({
        ...mexicoCommand,
        timezone: "Europe/Madrid",
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
    await expect(
      bootstrapOrganization({
        ...mexicoCommand,
        defaultCurrency: "EUR",
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
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
