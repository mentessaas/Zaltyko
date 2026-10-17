#!/usr/bin/env tsx
/* eslint-disable no-console */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";

import {
  formatLedgerMismatch,
  loadSqlMigrations,
  prepareMigrationSqlForRunner,
  reconcileSqlMigrationLedger,
  type SqlMigrationLedgerRow,
} from "@/lib/migrations/sql-migration-ledger";
import { E2E_DOMAIN_MIGRATIONS } from "./lib/e2e-domain-migrations";
import { assertE2ESandboxTarget } from "./lib/e2e-sandbox-target";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const EXPECTED_E2E_PROJECT_REF = "aeeootdmuiqkfeernskw";
const DOMAIN_LEDGER = "zaltyko_domain_private.e2e_schema_migrations";
const MIGRATION_LOCK = "zaltyko:e2e-domain-migrations:v1";

function getPool() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const caPath = process.env.NODE_EXTRA_CA_CERTS;
  const ca =
    caPath && existsSync(resolve(caPath))
      ? readFileSync(resolve(caPath), "utf8")
      : undefined;
  const isRemote = !["localhost", "127.0.0.1", "::1"].includes(
    new URL(databaseUrl).hostname
  );
  if (isRemote && !ca) {
    throw new Error(
      "NODE_EXTRA_CA_CERTS must point to the trusted PostgreSQL CA."
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

async function main() {
  const targetRef = process.env.E2E_TARGET_SUPABASE_PROJECT_REF;
  if (targetRef !== EXPECTED_E2E_PROJECT_REF) {
    throw new Error(
      "Greenfield E2E migrations only run on the verified Zaltyko E2E Sandbox."
    );
  }

  const projectRef = assertE2ESandboxTarget({
    databaseUrl: process.env.DATABASE_URL ?? "",
    databaseUrlPool: process.env.DATABASE_URL_POOL,
    databaseUrlDirect: process.env.DATABASE_URL_DIRECT,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    expectedProjectRef: targetRef,
    allowProvisioning: process.env.E2E_ALLOW_PROVISIONING,
  });
  if (projectRef !== EXPECTED_E2E_PROJECT_REF) {
    throw new Error(
      "Refusing to migrate a Supabase project other than the E2E Sandbox."
    );
  }

  const allMigrations = loadSqlMigrations(
    resolve(process.cwd(), "supabase/migrations")
  );
  const migrationByFilename = new Map(
    allMigrations.map((migration) => [migration.filename, migration])
  );
  const migrations = E2E_DOMAIN_MIGRATIONS.map((filename) => {
    const migration = migrationByFilename.get(filename);
    if (!migration)
      throw new Error(`Allowlisted domain migration is missing: ${filename}`);
    return migration;
  });

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [
      MIGRATION_LOCK,
    ]);

    const state = await client.query<{
      domain_schema: string | null;
      private_schema: string | null;
      ledger: string | null;
    }>(
      `select to_regnamespace('zaltyko')::text as domain_schema,
              to_regnamespace('zaltyko_domain_private')::text as private_schema,
              to_regclass('${DOMAIN_LEDGER}')::text as ledger`
    );
    const current = state.rows[0];
    if (!current)
      throw new Error("Could not inspect E2E domain migration state.");
    if ((current.domain_schema || current.private_schema) && !current.ledger) {
      throw new Error(
        "A partial or untracked greenfield schema exists in the E2E Sandbox; refusing to guess its migration history."
      );
    }
    if (!current.ledger) {
      await client.query("begin");
      try {
        await client.query("create schema zaltyko_domain_private");
        await client.query(`
          create table ${DOMAIN_LEDGER} (
            filename text primary key,
            version text not null,
            checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
            applied_at timestamptz not null default now()
          )
        `);
        await client.query(
          `revoke all on schema zaltyko_domain_private from public, anon, authenticated, service_role`
        );
        await client.query(
          `revoke all on table ${DOMAIN_LEDGER} from public, anon, authenticated, service_role`
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    const ledgerResult = await client.query<{
      version: string;
      filename: string;
      checksum: string;
    }>(
      `select version, filename, checksum from ${DOMAIN_LEDGER} order by version, filename`
    );
    const ledgerRows: SqlMigrationLedgerRow[] = ledgerResult.rows.map(
      (row) => ({
        ...row,
        executionMode: "ledger",
      })
    );
    if (current.domain_schema && ledgerRows.length === 0) {
      throw new Error(
        "The greenfield schema exists without recorded migrations; refusing to infer whether it is complete."
      );
    }
    if (!current.domain_schema && ledgerRows.length > 0) {
      throw new Error(
        "The E2E migration ledger records changes but the greenfield schema is missing."
      );
    }
    const reconciliation = reconcileSqlMigrationLedger(migrations, ledgerRows);
    const mismatches = formatLedgerMismatch(reconciliation);
    if (mismatches.length) {
      throw new Error(
        `Greenfield E2E migration ledger diverges:\n- ${mismatches.join("\n- ")}`
      );
    }

    if (reconciliation.pending.length === 0) {
      console.log(
        `E2E greenfield schema is current (${migrations.length} verified migrations).`
      );
    } else {
      for (const migration of reconciliation.pending) {
        console.log(
          `Applying allowlisted E2E domain migration ${migration.filename}`
        );
        await client.query("begin");
        try {
          await client.query(
            prepareMigrationSqlForRunner(migration.sql, migration.filename)
          );
          await client.query(
            `insert into ${DOMAIN_LEDGER} (version, filename, checksum) values ($1, $2, $3)`,
            [migration.version, migration.filename, migration.checksum]
          );
          await client.query("commit");
        } catch (error) {
          await client.query("rollback");
          throw error;
        }
      }
    }

    const verification = await client.query<{ applied: number }>(
      `select count(*)::int as applied from ${DOMAIN_LEDGER}`
    );
    if (verification.rows[0]?.applied !== migrations.length) {
      throw new Error(
        "Post-migration verification found an incomplete E2E domain ledger."
      );
    }
    const rlsVerification = await client.query<{
      domain_tables: number;
      unprotected_tables: number;
    }>(`
      select count(*)::int as domain_tables,
             count(*) filter (
               where not relation.relrowsecurity or not relation.relforcerowsecurity
             )::int as unprotected_tables
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'zaltyko'
        and relation.relkind = 'r'
    `);
    if (
      !rlsVerification.rows[0]?.domain_tables ||
      rlsVerification.rows[0].unprotected_tables !== 0
    ) {
      throw new Error(
        "E2E domain migration verification found missing tables or tables without forced RLS."
      );
    }
    console.log(
      `E2E greenfield schema verified (${migrations.length} migrations; target ${EXPECTED_E2E_PROJECT_REF}).`
    );
  } finally {
    try {
      await client.query("select pg_advisory_unlock(hashtext($1))", [
        MIGRATION_LOCK,
      ]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(
    `[e2e:domain-migrations] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
