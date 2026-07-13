import { describe, expect, it } from "vitest";

import {
  formatLedgerMismatch,
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
        version: migrations[0].version,
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
