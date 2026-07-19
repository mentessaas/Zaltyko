#!/usr/bin/env tsx
/* eslint-disable no-console */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
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
}

function usage(message?: string): never {
  if (message) console.error(`[db:migrate:ledger] ${message}`);
  console.error(
    "Uso: pnpm db:migrate:ledger [--apply] [--bootstrap --acknowledge-existing-history]"
  );
  console.error("Por defecto hace dry-run y no escribe nada.");
  process.exit(1);
}

function parseOptions(args: string[]): Options {
  const allowed = new Set([
    "--apply",
    "--bootstrap",
    "--acknowledge-existing-history",
  ]);
  const unknown = args.find((arg) => !allowed.has(arg));
  if (unknown) usage(`Opción desconocida: ${unknown}`);

  const options = {
    apply: args.includes("--apply"),
    bootstrap: args.includes("--bootstrap"),
    acknowledgeExistingHistory: args.includes("--acknowledge-existing-history"),
  };

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
  const connectionString = databaseUrl
    .replace(/([?&])sslmode=[^&]*&?/g, "$1")
    .replace(/[?&]$/, "");

  return new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15_000,
    ssl: isRemote
      ? ca
        ? { ca, rejectUnauthorized: true }
        : { rejectUnauthorized: false }
      : false,
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

    if (reconciliation.pending.length === 0) {
      console.log(
        `[db:migrate:ledger] OK: ${ledgerRows.length} migraciones verificadas; no hay pendientes.`
      );
      return;
    }

    console.log("[db:migrate:ledger] Migraciones pendientes:");
    reconciliation.pending.forEach((migration) =>
      console.log(`- ${migration.filename} (${migration.checksum})`)
    );

    if (!options.apply) {
      console.log(
        "[db:migrate:ledger] Dry-run: no se ejecutó SQL. Repite con --apply tras revisar los archivos."
      );
      return;
    }

    await client.query("begin");
    try {
      for (const migration of reconciliation.pending) {
        console.log(`[db:migrate:ledger] Aplicando ${migration.filename}`);
        await client.query(migration.sql);
        await insertLedgerRow(client, migration, "ledger");
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    console.log(
      `[db:migrate:ledger] Aplicadas ${reconciliation.pending.length} migraciones en una transacción.`
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
