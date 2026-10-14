import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadSqlMigrations } from "@/lib/migrations/sql-migration-ledger";
import {
  assertConfirmedTarget,
  buildStaticPlan,
  EXPECTED_E2E_PROJECT_REF,
  loadDeltaMigrations,
  runReadOnlyPreflight,
  type PreflightClient,
  type PreflightPool,
} from "../scripts/lib/e2e-schema-delta-preflight";
import { E2E_DOMAIN_MIGRATIONS } from "../scripts/lib/e2e-domain-migrations";

const allMigrations = loadSqlMigrations(
  resolve(process.cwd(), "supabase/migrations")
);
const byFilename = new Map(
  allMigrations.map((migration) => [migration.filename, migration])
);
const base = E2E_DOMAIN_MIGRATIONS.map((filename) => {
  const migration = byFilename.get(filename);
  if (!migration) throw new Error(`Missing fixture migration ${filename}`);
  return migration;
});
const delta = loadDeltaMigrations(allMigrations);

type LedgerRow = { version: string; filename: string; checksum: string };

function goodCatalog(overrides: Record<string, unknown> = {}) {
  return {
    domain_schema: true,
    private_schema: true,
    base_ledger: true,
    delta_ledger: false,
    auth_users: true,
    member_auth_fk: true,
    base_tables: [
      "organizations",
      "locations",
      "athletes",
      "price_plans",
      "class_templates",
      "enrollment_price_assignments",
      "enrollments",
      "invoices",
      "invoice_lines",
    ],
    delta_object_migrations: [],
    missing_delta_objects: [],
    delta_unprotected_tables: [],
    btree_gist_present: false,
    ...overrides,
  };
}

function createPool(
  args: {
    baseRows?: LedgerRow[];
    deltaRows?: LedgerRow[];
    catalog?: Record<string, unknown>;
    queries?: string[];
  } = {}
): PreflightPool {
  const queries = args.queries ?? [];
  const baseRows =
    args.baseRows ??
    base.map(({ version, filename, checksum }) => ({
      version,
      filename,
      checksum,
    }));
  const deltaRows = args.deltaRows ?? [];
  const client: PreflightClient = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("with expected_objects")) {
        return { rows: [goodCatalog(args.catalog)] };
      }
      if (
        sql.startsWith(
          "select version, filename, checksum from zaltyko_domain_private.e2e_schema_migrations"
        )
      ) {
        return { rows: baseRows };
      }
      if (
        sql.startsWith(
          "select version, filename, checksum from zaltyko_domain_private.e2e_delta_schema_migrations"
        )
      ) {
        return { rows: deltaRows };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return {
    connect: vi.fn(async () => client),
    end: vi.fn(async () => undefined),
  };
}

describe("E2E schema delta preflight", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve plan estático NO_VERIFICADO sin abrir conexiones", () => {
    const plan = buildStaticPlan(delta);
    expect(plan.verification).toBe("NO_VERIFICADO");
    expect(plan.mode).toBe("DRYRUN_READONLY");
    expect(plan.baseLedger.expected).toBe(16);
    expect(plan.migrations.map((migration) => migration.checksum)).toEqual(
      delta.map((migration) => migration.checksum)
    );
  });

  it("rechaza ref de producción y URL/ref discordantes antes de conectar", () => {
    expect(() =>
      assertConfirmedTarget({
        confirmation: "jegxfahsvugilbthbked",
        expectedProjectRef: "jegxfahsvugilbthbked",
        databaseUrl:
          "postgres://user:pass@db.jegxfahsvugilbthbked.supabase.co:5432/postgres",
      })
    ).toThrow("TARGET_CONFIRMATION_REQUIRED");
    expect(() =>
      assertConfirmedTarget({
        confirmation: EXPECTED_E2E_PROJECT_REF,
        expectedProjectRef: EXPECTED_E2E_PROJECT_REF,
        databaseUrl:
          "postgres://user:pass@db.jegxfahsvugilbthbked.supabase.co:5432/postgres",
      })
    ).toThrow();
  });

  it("verifica base exacta y termina solo con consultas de lectura", async () => {
    const queries: string[] = [];
    const pool = createPool({ queries });
    const result = await runReadOnlyPreflight(pool, base, delta);
    expect(result.verification).toBe("VERIFICADO");
    expect(result.baseLedger).toMatchObject({
      expected: 16,
      actual: 16,
      status: "PASS",
    });
    expect(
      result.migrations.every((migration) => migration.status === "PENDIENTE")
    ).toBe(true);
    expect(queries[0].toLowerCase()).toBe("begin read only");
    expect(queries.at(-1)?.toLowerCase()).toBe("rollback");
    expect(
      queries.some((sql) =>
        /\b(insert|update|delete|create|alter|drop|grant|revoke)\b/i.test(sql)
      )
    ).toBe(false);
  });

  it("acepta btree_gist preexistente en la base de 16 sin tratarlo como delta huérfana", async () => {
    const queries: string[] = [];
    const result = await runReadOnlyPreflight(
      createPool({
        queries,
        catalog: { btree_gist_present: true },
      }),
      base,
      delta
    );
    expect(result.verification).toBe("VERIFICADO");
    expect(result.deltaLedger).toEqual({ exists: false, applied: 0 });
    expect(result.sharedDependencies.btreeGistPresent).toBe(true);
    const catalogSql = queries.find((sql) =>
      sql.includes("with expected_objects")
    );
    expect(catalogSql).toContain("as btree_gist_present");
    expect(catalogSql).not.toContain("'extension:btree_gist'");
  });

  it("bloquea hashes cambiados y filas huérfanas del ledger base", async () => {
    const changedRows = base.map(({ version, filename, checksum }) => ({
      version,
      filename,
      checksum,
    }));
    changedRows[0].checksum = "f".repeat(64);
    const changed = await runReadOnlyPreflight(
      createPool({ baseRows: changedRows }),
      base,
      delta
    );
    expect(changed.verification).toBe("BLOQUEADO");
    expect(changed.blockers).toContain("BASE_LEDGER_DRIFT");

    const orphan = await runReadOnlyPreflight(
      createPool({
        baseRows: [
          ...base.map(({ version, filename, checksum }) => ({
            version,
            filename,
            checksum,
          })),
          {
            version: "20990101",
            filename: "20990101_orphan.sql",
            checksum: "a".repeat(64),
          },
        ],
      }),
      base,
      delta
    );
    expect(orphan.blockers).toContain("BASE_LEDGER_DRIFT");
  });

  it("bloquea objetos delta existentes sin ledger", async () => {
    const result = await runReadOnlyPreflight(
      createPool({
        catalog: { delta_object_migrations: [delta[0].filename] },
      }),
      base,
      delta
    );
    expect(result.verification).toBe("BLOQUEADO");
    expect(result.blockers).toContain("DELTA_OBJECTS_WITHOUT_LEDGER");
  });

  it("rechaza un checksum delta distinto del archivo local", async () => {
    const drifted = {
      version: delta[0].version,
      filename: delta[0].filename,
      checksum: "b".repeat(64),
    };
    const result = await runReadOnlyPreflight(
      createPool({
        catalog: {
          delta_ledger: true,
          delta_object_migrations: [delta[0].filename],
        },
        deltaRows: [drifted],
      }),
      base,
      delta
    );
    expect(result.blockers).toContain("DELTA_LEDGER_DRIFT");
  });

  it("acepta solo el prefijo #17 registrado con sus propios objetos y dependencia compartida", async () => {
    const firstRow = {
      version: delta[0].version,
      filename: delta[0].filename,
      checksum: delta[0].checksum,
    };
    const queries: string[] = [];
    const result = await runReadOnlyPreflight(
      createPool({
        queries,
        catalog: {
          delta_ledger: true,
          delta_object_migrations: [delta[0].filename],
          missing_delta_objects: [
            `${delta[1].filename}:table:price_plan_class_template_coverage`,
            `${delta[1].filename}:table:invoice_line_enrollments`,
          ],
          btree_gist_present: true,
        },
        deltaRows: [firstRow],
      }),
      base,
      delta
    );
    expect(result.verification).toBe("VERIFICADO");
    expect(result.deltaLedger).toEqual({ exists: true, applied: 1 });
    expect(result.migrations.map((migration) => migration.status)).toEqual([
      "REGISTRADA",
      "PENDIENTE",
    ]);
    const catalogSql = queries.find((sql) =>
      sql.includes("with expected_objects")
    );
    expect(catalogSql).toContain(
      `('${delta[0].filename}', 'trigger:owner_signup_consent_audits.owner_signup_consent_audit_append_only')`
    );
    expect(catalogSql).toContain(
      `('${delta[0].filename}', 'policy:owner_signup_consents.owner_signup_consents_self_read')`
    );
    expect(catalogSql).not.toContain(
      `('${delta[1].filename}', 'trigger:owner_signup_consent_audits.owner_signup_consent_audit_append_only')`
    );
    expect(catalogSql).not.toContain("'extension:btree_gist'");
  });

  it("bloquea objetos de migración pendiente aunque exista un prefijo ledger válido", async () => {
    const firstRow = {
      version: delta[0].version,
      filename: delta[0].filename,
      checksum: delta[0].checksum,
    };
    const result = await runReadOnlyPreflight(
      createPool({
        catalog: {
          delta_ledger: true,
          delta_object_migrations: [delta[0].filename, delta[1].filename],
        },
        deltaRows: [firstRow],
      }),
      base,
      delta
    );
    expect(result.blockers).toContain("DELTA_OBJECTS_WITHOUT_LEDGER");
  });

  it("bloquea tablas delta registradas sin RLS forzada", async () => {
    const firstRow = {
      version: delta[0].version,
      filename: delta[0].filename,
      checksum: delta[0].checksum,
    };
    const result = await runReadOnlyPreflight(
      createPool({
        catalog: {
          delta_ledger: true,
          delta_object_migrations: [delta[0].filename],
          delta_unprotected_tables: ["owner_signup_consents"],
        },
        deltaRows: [firstRow],
      }),
      base,
      delta
    );
    expect(result.blockers).toContain("DELTA_RLS_NOT_FORCED");
  });
});
