#!/usr/bin/env tsx
/* eslint-disable no-console */
import { resolve } from "node:path";

import { Pool } from "pg";

import {
  assertConfirmedTarget,
  buildStaticPlan,
  getDatabaseConnectionOptions,
  loadDeltaMigrations,
  readTrustedCa,
  runReadOnlyPreflight,
} from "./lib/e2e-schema-delta-preflight";
import { E2E_DOMAIN_MIGRATIONS } from "./lib/e2e-domain-migrations";
import { loadSqlMigrations } from "@/lib/migrations/sql-migration-ledger";

const DELTA_MIGRATIONS_DIRECTORY = resolve(
  process.cwd(),
  "supabase/migrations"
);

function argsFromCli(argv: string[]) {
  const connect = argv.includes("--connect");
  const confirmationIndex = argv.indexOf("--confirm-target");
  const valid = argv.every(
    (arg, index) =>
      arg === "--connect" ||
      arg === "--confirm-target" ||
      (confirmationIndex >= 0 && index === confirmationIndex + 1)
  );
  if (!valid || argv.includes("--apply")) {
    throw new Error("INVALID_ARGUMENTS");
  }
  return {
    connect,
    confirmation:
      confirmationIndex >= 0 ? argv[confirmationIndex + 1] : undefined,
  };
}

async function main() {
  const flags = argsFromCli(process.argv.slice(2));
  const allMigrations = loadSqlMigrations(DELTA_MIGRATIONS_DIRECTORY);
  const byFilename = new Map(
    allMigrations.map((migration) => [migration.filename, migration])
  );
  const baseMigrations = E2E_DOMAIN_MIGRATIONS.map((filename) => {
    const migration = byFilename.get(filename);
    if (!migration) throw new Error("BASE_MIGRATION_MISSING");
    return migration;
  });
  const delta = loadDeltaMigrations(allMigrations);

  if (!flags.connect) {
    console.log(JSON.stringify(buildStaticPlan(delta), null, 2));
    return;
  }

  // Environment files are loaded only after an explicit --connect opt-in.
  const { config } = await import("dotenv");
  config({ path: resolve(process.cwd(), ".env.local") });
  config({ path: resolve(process.cwd(), ".env") });
  const databaseUrl = process.env.DATABASE_URL;
  assertConfirmedTarget({
    confirmation: flags.confirmation,
    expectedProjectRef: process.env.E2E_TARGET_SUPABASE_PROJECT_REF,
    databaseUrl,
    databaseUrlPool: process.env.DATABASE_URL_POOL,
    databaseUrlDirect: process.env.DATABASE_URL_DIRECT,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const ca = readTrustedCa(process.env.NODE_EXTRA_CA_CERTS);
  if (!databaseUrl) throw new Error("TARGET_CONFIGURATION_INVALID");

  const pool = new Pool(getDatabaseConnectionOptions({ databaseUrl, ca }));
  const result = await runReadOnlyPreflight(pool, baseMigrations, delta);
  console.log(JSON.stringify(result, null, 2));
  if (result.verification !== "VERIFICADO") process.exitCode = 1;
}

main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "PREFLIGHT_FAILED";
  console.error(JSON.stringify({ mode: "DRYRUN_READONLY", error: code }));
  process.exitCode = 1;
});
