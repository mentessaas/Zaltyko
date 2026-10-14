import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  formatLedgerMismatch,
  reconcileSqlMigrationLedger,
  type SqlMigration,
  type SqlMigrationLedgerRow,
} from "@/lib/migrations/sql-migration-ledger";
import {
  E2E_DOMAIN_MIGRATIONS,
  E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS,
  E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
} from "./e2e-domain-migrations";
import { assertE2EProjectTarget } from "./e2e-sandbox-target";

export const EXPECTED_E2E_PROJECT_REF = "aeeootdmuiqkfeernskw";
export const BASE_LEDGER = "zaltyko_domain_private.e2e_schema_migrations";
export const DELTA_LEDGER =
  "zaltyko_domain_private.e2e_delta_schema_migrations";

export type DeltaMigration = SqlMigration & { ordinal: number };

export interface PreflightPool {
  connect(): Promise<PreflightClient>;
  end(): Promise<void>;
}

export interface PreflightClient {
  query<T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }>;
  release(): void;
}

export interface PreflightResult {
  mode: "DRYRUN_READONLY";
  targetProjectRef: string;
  verification: "NO_VERIFICADO" | "VERIFICADO" | "BLOQUEADO";
  baseLedger: { expected: number; actual: number | null; status: string };
  deltaLedger: { exists: boolean | null; applied: number | null };
  sharedDependencies: { btreeGistPresent: boolean | null };
  migrations: Array<{
    filename: string;
    version: string;
    checksum: string;
    status: "PENDIENTE" | "REGISTRADA";
  }>;
  preconditions: Array<{ name: string; status: "PASS" | "FAIL" }>;
  blockers: string[];
}

const EXPECTED_DELTA = [
  ...E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
  ...E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS,
] as const;

const EXPECTED_DELTA_OBJECTS: Record<string, readonly string[]> = {
  [E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS[0]]: [
    "table:owner_signup_consent_policy",
    "table:owner_signup_consents",
    "table:owner_signup_consent_audits",
    "function:reject_owner_signup_consent_audit_mutation()",
    "index:owner_signup_consents_policy_version_idx",
    "index:owner_signup_consent_audits_user_recorded_idx",
    "trigger:owner_signup_consent_audits.owner_signup_consent_audit_append_only",
    "trigger:owner_signup_consent_audits.owner_signup_consent_audit_no_truncate",
    "policy:owner_signup_consents.owner_signup_consents_self_read",
    "policy:owner_signup_consent_audits.owner_signup_consent_audits_self_read",
  ],
  [E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS[0]]: [
    "table:price_plan_class_template_coverage",
    "table:invoice_line_enrollments",
    "function_private:prevent_invoice_line_enrollment_mutation()",
    "column:invoice_lines.location_id",
    "column:invoice_lines.athlete_id",
    "constraint:enrollments.enrollments_billing_coverage_fk_uq",
    "constraint:enrollment_price_assignments.enrollment_price_assignments_coverage_fk_uq",
    "constraint:invoices.invoices_billing_line_location_fk_uq",
    "constraint:invoice_lines.invoice_lines_location_fk",
    "constraint:invoice_lines.invoice_lines_athlete_fk",
    "constraint:invoice_lines.invoice_lines_athlete_monthly_shape",
    "constraint:invoice_lines.invoice_lines_location_invoice_fk",
    "constraint:price_plan_class_template_coverage.price_plan_class_template_coverage_org_id_uq",
    "constraint:price_plan_class_template_coverage.price_plan_class_template_coverage_dates_valid",
    "constraint:price_plan_class_template_coverage.price_plan_class_template_coverage_location_fk",
    "constraint:price_plan_class_template_coverage.price_plan_class_template_coverage_plan_fk",
    "constraint:price_plan_class_template_coverage.price_plan_class_template_coverage_template_fk",
    "constraint:price_plan_class_template_coverage.price_plan_class_template_coverage_no_overlap",
    "constraint:invoice_line_enrollments.invoice_line_enrollments_pkey",
    "constraint:invoice_line_enrollments.invoice_line_enrollments_line_template_uq",
    "constraint:invoice_line_enrollments.invoice_line_enrollments_class_name_not_blank",
    "constraint:invoice_line_enrollments.invoice_line_enrollments_location_fk",
    "constraint:invoice_line_enrollments.invoice_line_enrollments_athlete_fk",
    "constraint:invoice_line_enrollments.invoice_line_enrollments_line_fk",
    "constraint:invoice_line_enrollments.invoice_line_enrollments_enrollment_fk",
    "constraint:invoice_line_enrollments.invoice_line_enrollments_class_template_fk",
    "constraint:invoice_line_enrollments.invoice_line_enrollments_price_assignment_fk",
    "index:invoice_lines_coverage_parent_fk_uq",
    "index:invoice_lines_monthly_athlete_uq",
    "index:price_plan_class_template_coverage_lookup_idx",
    "index:invoice_line_enrollments_enrollment_idx",
    "trigger:invoice_line_enrollments.invoice_line_enrollments_immutable_row",
    "trigger:invoice_line_enrollments.invoice_line_enrollments_immutable_truncate",
    "policy:price_plan_class_template_coverage.price_plan_class_template_coverage_deny_clients",
    "policy:invoice_line_enrollments.invoice_line_enrollments_deny_clients",
  ],
};

export function loadDeltaMigrations(
  migrations: SqlMigration[]
): DeltaMigration[] {
  const byFilename = new Map(migrations.map((item) => [item.filename, item]));
  return EXPECTED_DELTA.map((filename, index) => {
    const migration = byFilename.get(filename);
    if (!migration) throw new Error("DELTA_MIGRATION_MISSING");
    return { ...migration, ordinal: index + 1 };
  });
}

export function buildStaticPlan(delta: DeltaMigration[]): PreflightResult {
  return {
    mode: "DRYRUN_READONLY",
    targetProjectRef: EXPECTED_E2E_PROJECT_REF,
    verification: "NO_VERIFICADO",
    baseLedger: {
      expected: E2E_DOMAIN_MIGRATIONS.length,
      actual: null,
      status: "NO_CONSULTADO",
    },
    deltaLedger: { exists: null, applied: null },
    sharedDependencies: { btreeGistPresent: null },
    migrations: delta.map((item) => ({
      filename: item.filename,
      version: item.version,
      checksum: item.checksum,
      status: "PENDIENTE",
    })),
    preconditions: [],
    blockers: [],
  };
}

export function assertConfirmedTarget(args: {
  confirmation: string | undefined;
  expectedProjectRef: string | undefined;
  databaseUrl: string | undefined;
  databaseUrlPool?: string;
  databaseUrlDirect?: string;
  supabaseUrl?: string;
}): void {
  if (args.confirmation !== EXPECTED_E2E_PROJECT_REF) {
    throw new Error("TARGET_CONFIRMATION_REQUIRED");
  }
  if (
    args.expectedProjectRef !== EXPECTED_E2E_PROJECT_REF ||
    !args.databaseUrl
  ) {
    throw new Error("TARGET_CONFIGURATION_INVALID");
  }

  assertE2EProjectTarget({
    databaseUrl: args.databaseUrl,
    databaseUrlPool: args.databaseUrlPool,
    databaseUrlDirect: args.databaseUrlDirect,
    supabaseUrl: args.supabaseUrl,
    expectedProjectRef: args.expectedProjectRef,
  });

  const url = new URL(args.databaseUrl);
  if (
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    (url.searchParams.has("sslmode") &&
      !["require", "verify-ca", "verify-full"].includes(
        url.searchParams.get("sslmode")!.toLowerCase()
      ))
  ) {
    throw new Error("DATABASE_TLS_OR_HOST_INVALID");
  }
}

export function readTrustedCa(caPath: string | undefined): string {
  if (!caPath || !existsSync(resolve(caPath))) {
    throw new Error("TRUSTED_CA_REQUIRED");
  }
  return readFileSync(resolve(caPath), "utf8");
}

function asLedgerRows(
  rows: Array<Omit<SqlMigrationLedgerRow, "executionMode">>
) {
  return rows.map((row) => ({ ...row, executionMode: "ledger" as const }));
}

export async function runReadOnlyPreflight(
  pool: PreflightPool,
  baseMigrations: SqlMigration[],
  delta: DeltaMigration[]
): Promise<PreflightResult> {
  const result = buildStaticPlan(delta);
  let client: PreflightClient | undefined;
  try {
    client = await pool.connect();
    await client.query("begin read only");
    await client.query("set local statement_timeout = '15000ms'");

    const catalogResult = await client.query<{
      domain_schema: boolean;
      private_schema: boolean;
      base_ledger: boolean;
      delta_ledger: boolean;
      auth_users: boolean;
      member_auth_fk: boolean;
      base_tables: string[];
      delta_object_migrations: string[];
      missing_delta_objects: string[];
      delta_unprotected_tables: string[];
      btree_gist_present: boolean;
    }>(`
      with expected_objects(migration, name) as (
        values ${Object.entries(EXPECTED_DELTA_OBJECTS)
          .flatMap(([migration, names]) =>
            names.map((name) => `('${migration}', '${name}')`)
          )
          .join(",\n               ")}
      ), object_state as (
        select migration, name,
          case
            when name like 'table:%' then to_regclass('zaltyko.' || split_part(name, ':', 2)) is not null
            when name like 'function:%' then to_regprocedure('zaltyko.' || split_part(name, ':', 2)) is not null
            when name like 'function_private:%' then to_regprocedure('zaltyko_domain_private.' || split_part(name, ':', 2)) is not null
            when name like 'extension:%' then exists (
              select 1 from pg_extension where extname = split_part(name, ':', 2)
            )
            when name like 'column:%' then exists (
              select 1 from information_schema.columns
              where table_schema = 'zaltyko'
                and table_name = split_part(split_part(name, ':', 2), '.', 1)
                and column_name = split_part(split_part(name, ':', 2), '.', 2)
            )
            when name like 'constraint:%' then exists (
              select 1 from pg_constraint c
              join pg_class r on r.oid = c.conrelid
              join pg_namespace n on n.oid = r.relnamespace
              where n.nspname = 'zaltyko'
                and r.relname = split_part(split_part(name, ':', 2), '.', 1)
                and c.conname = split_part(split_part(name, ':', 2), '.', 2)
            )
            when name like 'index:%' then to_regclass('zaltyko.' || split_part(name, ':', 2)) is not null
            when name like 'trigger:%' then exists (
              select 1 from pg_trigger t
              join pg_class r on r.oid = t.tgrelid
              join pg_namespace n on n.oid = r.relnamespace
              where n.nspname = 'zaltyko'
                and r.relname = split_part(split_part(name, ':', 2), '.', 1)
                and t.tgname = split_part(split_part(name, ':', 2), '.', 2)
                and not t.tgisinternal
            )
            when name like 'policy:%' then exists (
              select 1 from pg_policy p
              join pg_class r on r.oid = p.polrelid
              join pg_namespace n on n.oid = r.relnamespace
              where n.nspname = 'zaltyko'
                and r.relname = split_part(split_part(name, ':', 2), '.', 1)
                and p.polname = split_part(split_part(name, ':', 2), '.', 2)
            )
            else false
          end as present
        from expected_objects
      )
      select
        to_regnamespace('zaltyko') is not null as domain_schema,
        to_regnamespace('zaltyko_domain_private') is not null as private_schema,
        to_regclass('${BASE_LEDGER}') is not null as base_ledger,
        to_regclass('${DELTA_LEDGER}') is not null as delta_ledger,
        exists (select 1 from pg_extension where extname = 'btree_gist') as btree_gist_present,
        to_regclass('auth.users') is not null as auth_users,
        exists (
          select 1 from pg_constraint c
          join pg_class r on r.oid = c.conrelid
          join pg_namespace n on n.oid = r.relnamespace
          where n.nspname = 'zaltyko' and r.relname = 'organization_members'
            and c.contype = 'f' and c.confrelid = to_regclass('auth.users')
        ) as member_auth_fk,
        array(
          select name from (values
            ('organizations'), ('locations'), ('athletes'), ('price_plans'),
            ('class_templates'), ('enrollment_price_assignments'), ('enrollments'),
            ('invoices'), ('invoice_lines')
          ) required(name)
          where to_regclass('zaltyko.' || name) is not null
        ) as base_tables,
        array(select distinct migration from object_state where present order by migration) as delta_object_migrations,
        array(select migration || ':' || name from object_state where not present order by migration, name) as missing_delta_objects,
        array(
          select split_part(name, ':', 2) from object_state
          where name like 'table:%' and present and not exists (
            select 1 from pg_class r
            join pg_namespace n on n.oid = r.relnamespace
            where n.nspname = 'zaltyko'
              and r.relname = split_part(name, ':', 2)
              and r.relrowsecurity and r.relforcerowsecurity
          )
        ) as delta_unprotected_tables
    `);

    const catalog = catalogResult.rows[0];
    if (!catalog) throw new Error("CATALOG_QUERY_FAILED");
    result.sharedDependencies.btreeGistPresent = catalog.btree_gist_present;

    const expectedBaseTables = 9;
    const baseTablePass = catalog.base_tables.length === expectedBaseTables;
    result.preconditions.push(
      {
        name: "base_schemas_and_ledger",
        status:
          catalog.domain_schema && catalog.private_schema && catalog.base_ledger
            ? "PASS"
            : "FAIL",
      },
      {
        name: "base_catalog_dependencies",
        status:
          baseTablePass && catalog.auth_users && catalog.member_auth_fk
            ? "PASS"
            : "FAIL",
      }
    );

    if (!catalog.base_ledger) throw new Error("BASE_LEDGER_MISSING");
    const baseRowsResult = await client.query<{
      version: string;
      filename: string;
      checksum: string;
    }>(
      `select version, filename, checksum from ${BASE_LEDGER} order by version, filename`
    );
    result.baseLedger.actual = baseRowsResult.rows.length;
    const baseReconciliation = reconcileSqlMigrationLedger(
      baseMigrations,
      asLedgerRows(baseRowsResult.rows)
    );
    const baseMismatch = formatLedgerMismatch(baseReconciliation);
    const baseExact =
      baseReconciliation.pending.length === 0 &&
      baseMismatch.length === 0 &&
      baseRowsResult.rows.length === baseMigrations.length;
    result.baseLedger.status = baseExact ? "PASS" : "FAIL";
    if (!baseExact) throw new Error("BASE_LEDGER_DRIFT");

    if (
      !catalog.domain_schema ||
      !catalog.private_schema ||
      !baseTablePass ||
      !catalog.auth_users ||
      !catalog.member_auth_fk
    ) {
      throw new Error("BASE_CATALOG_PRECONDITION_FAILED");
    }
    if (catalog.delta_object_migrations.length > 0 && !catalog.delta_ledger) {
      throw new Error("DELTA_OBJECTS_WITHOUT_LEDGER");
    }

    let deltaRows: SqlMigrationLedgerRow[] = [];
    if (catalog.delta_ledger) {
      const deltaRowsResult = await client.query<{
        version: string;
        filename: string;
        checksum: string;
      }>(
        `select version, filename, checksum from ${DELTA_LEDGER} order by version, filename`
      );
      deltaRows = asLedgerRows(deltaRowsResult.rows);
      if (
        catalog.delta_object_migrations.length > 0 &&
        deltaRows.length === 0
      ) {
        throw new Error("DELTA_OBJECTS_WITHOUT_LEDGER");
      }
      const deltaReconciliation = reconcileSqlMigrationLedger(delta, deltaRows);
      if (formatLedgerMismatch(deltaReconciliation).length) {
        throw new Error("DELTA_LEDGER_DRIFT");
      }
      const applied = delta.filter((migration) =>
        deltaRows.some((row) => row.filename === migration.filename)
      );
      for (const migration of delta) {
        const recorded = deltaRows.some(
          (row) => row.filename === migration.filename
        );
        const objectsPresent = catalog.delta_object_migrations.includes(
          migration.filename
        );
        const missingObjects = catalog.missing_delta_objects.some((entry) =>
          entry.startsWith(`${migration.filename}:`)
        );
        if (recorded && (!objectsPresent || missingObjects)) {
          throw new Error("DELTA_LEDGER_WITHOUT_OBJECTS");
        }
        if (!recorded && objectsPresent) {
          throw new Error("DELTA_OBJECTS_WITHOUT_LEDGER");
        }
        if (
          recorded &&
          EXPECTED_DELTA_OBJECTS[migration.filename]
            ?.filter((name) => name.startsWith("table:"))
            .some((name) =>
              catalog.delta_unprotected_tables.includes(
                name.slice("table:".length)
              )
            )
        ) {
          throw new Error("DELTA_RLS_NOT_FORCED");
        }
        if (
          recorded &&
          migration.filename === E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS[0] &&
          !catalog.btree_gist_present
        ) {
          throw new Error("DELTA_DEPENDENCY_MISSING");
        }
      }
      const expectedPrefix = delta.slice(0, applied.length);
      if (
        applied.some(
          (migration, index) =>
            migration.filename !== expectedPrefix[index]?.filename
        )
      ) {
        throw new Error("DELTA_LEDGER_NOT_PREFIX");
      }
      result.deltaLedger = { exists: true, applied: deltaRows.length };
      result.migrations = delta.map((migration) => ({
        filename: migration.filename,
        version: migration.version,
        checksum: migration.checksum,
        status: deltaRows.some((row) => row.filename === migration.filename)
          ? "REGISTRADA"
          : "PENDIENTE",
      }));
    } else {
      result.deltaLedger = { exists: false, applied: 0 };
    }

    result.preconditions.push(
      { name: "base_ledger_exact_hashes", status: "PASS" },
      { name: "delta_namespace_drift", status: "PASS" }
    );
    result.verification = "VERIFICADO";
    return result;
  } catch (error) {
    result.verification = "BLOQUEADO";
    result.blockers.push(
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "PREFLIGHT_QUERY_FAILED"
    );
    return result;
  } finally {
    try {
      await client?.query("rollback");
    } catch {
      // The connection is released even when the read-only transaction fails.
    }
    client?.release();
    await pool.end();
  }
}

export function getDatabaseConnectionOptions(args: {
  databaseUrl: string;
  ca: string;
}) {
  const url = new URL(args.databaseUrl);
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) {
    url.searchParams.delete(key);
  }
  return {
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 15_000,
    ssl: { ca: args.ca, rejectUnauthorized: true as const },
  };
}
