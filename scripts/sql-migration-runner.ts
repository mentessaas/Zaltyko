#!/usr/bin/env tsx
/* eslint-disable no-console */
import { config } from "dotenv";
<<<<<<< HEAD
import { existsSync, readFileSync, writeFileSync } from "node:fs";
=======
import { existsSync, readFileSync } from "node:fs";
>>>>>>> origin/main
import { resolve } from "node:path";

import { Pool, type PoolClient } from "pg";

import {
  formatLedgerMismatch,
  loadSqlMigrations,
  reconcileSqlMigrationLedger,
  SQL_MIGRATION_LEDGER_LOCK,
  SQL_MIGRATION_LEDGER_TABLE,
  type SqlMigrationLedgerRow,
} from "@/lib/migrations/sql-migration-ledger";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase", "migrations");
const BASELINE_RELATIONS = [
  "academies",
  "memberships",
  "academy_trials",
  "billing_events",
  "growth_events",
  "commercial_interviews",
];

interface Options {
  apply: boolean;
  bootstrap: boolean;
  acknowledgeExistingHistory: boolean;
<<<<<<< HEAD
  onlyFilename?: string;
  evidenceFile?: string;
=======
>>>>>>> origin/main
}

function usage(message?: string): never {
  if (message) console.error(`[db:migrate:ledger] ${message}`);
  console.error(
<<<<<<< HEAD
    "Uso: pnpm db:migrate:ledger [--apply] [--only <archivo.sql>] [--evidence-file <ruta>] [--bootstrap --acknowledge-existing-history]"
=======
    "Uso: pnpm db:migrate:ledger [--apply] [--bootstrap --acknowledge-existing-history]"
>>>>>>> origin/main
  );
  console.error("Por defecto hace dry-run y no escribe nada.");
  process.exit(1);
}

function parseOptions(args: string[]): Options {
<<<<<<< HEAD
  const options: Options = {
=======
  const allowed = new Set([
    "--apply",
    "--bootstrap",
    "--acknowledge-existing-history",
  ]);
  const unknown = args.find((arg) => !allowed.has(arg));
  if (unknown) usage(`Opción desconocida: ${unknown}`);

  const options = {
>>>>>>> origin/main
    apply: args.includes("--apply"),
    bootstrap: args.includes("--bootstrap"),
    acknowledgeExistingHistory: args.includes("--acknowledge-existing-history"),
  };

<<<<<<< HEAD
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--only" || arg === "--evidence-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        usage(`${arg} requiere un valor.`);
      }
      if (arg === "--only") options.onlyFilename = value;
      if (arg === "--evidence-file") options.evidenceFile = value;
      index += 1;
      continue;
    }
    if (
      !new Set(["--apply", "--bootstrap", "--acknowledge-existing-history"]).has(
        arg
      )
    ) {
      usage(`Opción desconocida: ${arg}`);
    }
  }

=======
>>>>>>> origin/main
  if (
    options.bootstrap &&
    (!options.apply || !options.acknowledgeExistingHistory)
  ) {
    usage("--bootstrap exige --apply --acknowledge-existing-history.");
  }
  if (options.acknowledgeExistingHistory && !options.bootstrap) {
    usage(
      "--acknowledge-existing-history solo se permite junto a --bootstrap."
    );
  }
<<<<<<< HEAD
  if (options.onlyFilename && options.bootstrap) {
    usage("--only no se puede combinar con --bootstrap.");
  }
=======
>>>>>>> origin/main
  return options;
}

function getPool() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) usage("DATABASE_URL no está definida.");

  const caPath = process.env.NODE_EXTRA_CA_CERTS;
  const ca =
    caPath && existsSync(resolve(caPath))
      ? readFileSync(resolve(caPath), "utf8")
      : undefined;
  const isRemote = !["localhost", "127.0.0.1", "::1"].includes(
    new URL(databaseUrl).hostname
  );
  if (isRemote && !ca) {
    usage(
      "NODE_EXTRA_CA_CERTS debe apuntar a la CA confiable para conexiones PostgreSQL remotas."
    );
  }
  const connectionString = databaseUrl
    .replace(/([?&])sslmode=[^&]*&?/g, "$1")
    .replace(/[?&]$/, "");

  return new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15_000,
    ssl: isRemote ? { ca, rejectUnauthorized: true } : false,
  });
}

async function hasLedgerTable(client: PoolClient) {
  const result = await client.query<{ relation: string | null }>(
    "select to_regclass('public.zaltyko_schema_migrations') as relation"
  );
  return result.rows[0]?.relation === SQL_MIGRATION_LEDGER_TABLE;
}

async function getLedgerRows(
  client: PoolClient
): Promise<SqlMigrationLedgerRow[]> {
  const result = await client.query<{
    version: string;
    filename: string;
    checksum: string;
    execution_mode: "ledger" | "baseline_verified";
  }>(
    `select version, filename, checksum, execution_mode
       from public.${SQL_MIGRATION_LEDGER_TABLE}
       order by version, filename`
  );
  return result.rows.map((row) => ({
    version: row.version,
    filename: row.filename,
    checksum: row.checksum,
    executionMode: row.execution_mode,
  }));
}

async function assertBaselineSchema(client: PoolClient) {
  const result = await client.query<{
    relation_name: string;
    relation: string | null;
  }>(
    `select relation_name, to_regclass('public.' || relation_name) as relation
       from unnest($1::text[]) as relation_name`,
    [BASELINE_RELATIONS]
  );
  const missing = result.rows
    .filter((row) => !row.relation)
    .map((row) => row.relation_name);
  if (missing.length > 0) {
    throw new Error(
      `No se puede bootstrapear el historial: faltan relaciones base verificadas (${missing.join(", ")}).`
    );
  }
}

async function insertLedgerRow(
  client: PoolClient,
  migration: { version: string; filename: string; checksum: string },
  executionMode: "ledger" | "baseline_verified"
) {
  await client.query(
    `insert into public.${SQL_MIGRATION_LEDGER_TABLE}
      (version, filename, checksum, execution_mode)
     values ($1, $2, $3, $4)`,
    [migration.version, migration.filename, migration.checksum, executionMode]
  );
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const migrations = loadSqlMigrations(MIGRATIONS_DIR);
<<<<<<< HEAD
  if (options.onlyFilename && !migrations.some((migration) => migration.filename === options.onlyFilename)) {
    usage(`No existe la migración seleccionada: ${options.onlyFilename}`);
  }
=======
>>>>>>> origin/main
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [
      SQL_MIGRATION_LEDGER_LOCK,
    ]);

    if (!(await hasLedgerTable(client))) {
      throw new Error(
        `No existe ${SQL_MIGRATION_LEDGER_TABLE}. Aplica primero la migración de corte revisada con pnpm db:migrate:reviewed supabase/migrations/20260713200000_create_sql_migration_ledger.sql.`
      );
    }

    const ledgerRows = await getLedgerRows(client);
    if (options.bootstrap) {
      if (ledgerRows.length > 0) {
        throw new Error("El ledger ya contiene filas; bootstrap rechazado.");
      }

      await client.query("begin");
      await assertBaselineSchema(client);
      for (const migration of migrations) {
        await insertLedgerRow(client, migration, "baseline_verified");
      }
      await client.query("commit");
      console.log(
        `[db:migrate:ledger] Bootstrap verificado: ${migrations.length} archivos reales registrados.`
      );
      return;
    }

    const reconciliation = reconcileSqlMigrationLedger(migrations, ledgerRows);
    const mismatches = formatLedgerMismatch(reconciliation);
    if (mismatches.length > 0) {
      throw new Error(`Ledger divergente:\n- ${mismatches.join("\n- ")}`);
    }

<<<<<<< HEAD
    const pending = options.onlyFilename
      ? reconciliation.pending.filter(
          (migration) => migration.filename === options.onlyFilename
        )
      : reconciliation.pending;

    if (options.onlyFilename && pending.length === 0) {
      console.log(
        `[db:migrate:ledger] OK: ${options.onlyFilename} ya está verificada en el ledger; no se ejecutó SQL.`
      );
      return;
    }

    if (pending.length === 0) {
=======
    if (reconciliation.pending.length === 0) {
>>>>>>> origin/main
      console.log(
        `[db:migrate:ledger] OK: ${ledgerRows.length} migraciones verificadas; no hay pendientes.`
      );
      return;
    }

    console.log("[db:migrate:ledger] Migraciones pendientes:");
<<<<<<< HEAD
    pending.forEach((migration) =>
      console.log(`- ${migration.filename} (${migration.checksum})`)
    );

    if (options.onlyFilename && reconciliation.pending.length !== pending.length) {
      console.log(
        `[db:migrate:ledger] Selección explícita: se omiten ${reconciliation.pending.length - pending.length} migraciones pendientes no seleccionadas.`
      );
    }

=======
    reconciliation.pending.forEach((migration) =>
      console.log(`- ${migration.filename} (${migration.checksum})`)
    );

>>>>>>> origin/main
    if (!options.apply) {
      console.log(
        "[db:migrate:ledger] Dry-run: no se ejecutó SQL. Repite con --apply tras revisar los archivos."
      );
      return;
    }

    await client.query("begin");
<<<<<<< HEAD
    let executionResults: unknown;
    try {
      for (const migration of pending) {
        console.log(`[db:migrate:ledger] Aplicando ${migration.filename}`);
        executionResults = await client.query(migration.sql);
=======
    try {
      for (const migration of reconciliation.pending) {
        console.log(`[db:migrate:ledger] Aplicando ${migration.filename}`);
        await client.query(migration.sql);
>>>>>>> origin/main
        await insertLedgerRow(client, migration, "ledger");
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

<<<<<<< HEAD
    if (options.evidenceFile && executionResults) {
      const resultList = (Array.isArray(executionResults)
        ? executionResults
        : [executionResults]) as Array<{
        command?: string;
        rowCount?: number | null;
        rows?: unknown[];
      }>;
      writeFileSync(
        resolve(options.evidenceFile),
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            migration: options.onlyFilename ?? null,
            results: resultList.map((result) => ({
              command: result.command ?? null,
              rowCount: result.rowCount ?? null,
              rows: result.rows ?? [],
            })),
          },
          null,
          2
        )}\n`,
        "utf8"
      );
      console.log(`[db:migrate:ledger] Evidencia escrita en ${options.evidenceFile}`);
    }

    console.log(
      `[db:migrate:ledger] Aplicadas ${pending.length} migraciones en una transacción.`
=======
    console.log(
      `[db:migrate:ledger] Aplicadas ${reconciliation.pending.length} migraciones en una transacción.`
>>>>>>> origin/main
    );
  } finally {
    try {
      await client.query("select pg_advisory_unlock(hashtext($1))", [
        SQL_MIGRATION_LEDGER_LOCK,
      ]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(
    `[db:migrate:ledger] ERROR: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
