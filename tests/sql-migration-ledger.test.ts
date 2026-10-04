import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatLedgerMismatch,
  prepareMigrationSqlForRunner,
  reconcileSqlMigrationLedger,
  type SqlMigration,
  type SqlMigrationLedgerRow,
} from "@/lib/migrations/sql-migration-ledger";

const migrations: SqlMigration[] = [
  {
    version: "20260713170000",
    filename: "20260713170000_phase4.sql",
    checksum: "a".repeat(64),
    sql: "select 1",
  },
  {
    version: "20260713200000",
    filename: "20260713200000_ledger.sql",
    checksum: "b".repeat(64),
    sql: "select 2",
  },
];

describe("SQL migration ledger", () => {
  it("keeps a legacy outer transaction wrapper inside the runner transaction", () => {
    const sql =
      "-- legacy wrapper\nBEGIN;\nCREATE TABLE public.example (id integer);\n" +
      "DO $$ BEGIN PERFORM 'inner;'; END $$;\nCOMMIT;";

    const prepared = prepareMigrationSqlForRunner(sql, "legacy.sql");

    expect(prepared).toContain("CREATE TABLE public.example");
    expect(prepared).toContain("DO $$ BEGIN PERFORM 'inner;'; END $$");
    expect(prepared).not.toMatch(/^\s*BEGIN\b/i);
    expect(prepared).not.toMatch(/\bCOMMIT\s*;?\s*$/i);
  });

  it("prepares the pending FK-index migration without losing its SQL body", () => {
    const filename = "20260929223000_harden_internal_tables_and_fk_indexes.sql";
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations", filename),
      "utf8"
    );

    const prepared = prepareMigrationSqlForRunner(sql, filename);

    expect(prepared.match(/CREATE INDEX IF NOT EXISTS/gi)).toHaveLength(60);
    expect(prepared).toMatch(
      /REVOKE ALL ON public\.__drizzle_migrations FROM anon, authenticated, public/i
    );
    expect(prepared).not.toMatch(/^\s*BEGIN\s*;/i);
    expect(prepared).not.toMatch(/\bCOMMIT\s*;?\s*$/i);
  });

  it("rejects transaction controls inside a migration body", () => {
    expect(() =>
      prepareMigrationSqlForRunner(
        "CREATE TABLE public.example (id integer); COMMIT; SELECT 1;",
        "unsafe.sql"
      )
    ).toThrow(/control transaccional/);
  });

  it("does not treat strings, comments, or dollar-quoted blocks as transaction commands", () => {
    const sql =
      "SELECT 'BEGIN;'; -- COMMIT;\n" +
      "DO $$ BEGIN PERFORM 'ROLLBACK;'; END $$;";

    expect(() => prepareMigrationSqlForRunner(sql, "quoted.sql")).not.toThrow();
  });

  it("detects pending real migration files", () => {
    const rows: SqlMigrationLedgerRow[] = [
      {
        version: migrations[0].version,
        filename: migrations[0].filename,
        checksum: migrations[0].checksum,
        executionMode: "baseline_verified",
      },
    ];

    const result = reconcileSqlMigrationLedger(migrations, rows);
    expect(result.pending.map((migration) => migration.filename)).toEqual([
      "20260713200000_ledger.sql",
    ]);
    expect(result.changed).toHaveLength(0);
    expect(result.orphaned).toHaveLength(0);
  });

  it("blocks a checksum change or an orphaned ledger row", () => {
    const rows: SqlMigrationLedgerRow[] = [
      {
        version: "20260713170001",
        filename: migrations[0].filename,
        checksum: "c".repeat(64),
        executionMode: "ledger",
      },
      {
        version: "20260701000000",
        filename: "20260701000000_missing.sql",
        checksum: "d".repeat(64),
        executionMode: "ledger",
      },
    ];

    const result = reconcileSqlMigrationLedger(migrations, rows);
    expect(result.changed).toHaveLength(1);
    expect(result.orphaned).toHaveLength(1);
    expect(formatLedgerMismatch(result)).toHaveLength(2);
    expect(formatLedgerMismatch(result)[0]).toContain("archivo=20260713170000");
    expect(formatLedgerMismatch(result)[0]).toContain("ledger=20260713170001");
  });

  it("accepts legacy files that share a numeric prefix", () => {
    const legacy: SqlMigration[] = [
      {
        version: "0009",
        filename: "0009_technical.sql",
        checksum: "e".repeat(64),
        sql: "select 1",
      },
      {
        version: "0009",
        filename: "0009_sport_config.sql",
        checksum: "f".repeat(64),
        sql: "select 2",
      },
    ];
    const rows: SqlMigrationLedgerRow[] = legacy.map((migration) => ({
      version: migration.version,
      filename: migration.filename,
      checksum: migration.checksum,
      executionMode: "baseline_verified",
    }));

    const result = reconcileSqlMigrationLedger(legacy, rows);
    expect(result.pending).toHaveLength(0);
    expect(formatLedgerMismatch(result)).toHaveLength(0);
  });
});
