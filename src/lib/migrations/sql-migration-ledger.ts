import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SQL_MIGRATION_LEDGER_TABLE = "zaltyko_schema_migrations";
export const SQL_MIGRATION_LEDGER_LOCK = "zaltyko:sql-migration-ledger:v1";

const MIGRATION_FILENAME = /^(\d{4,14})_([a-z0-9][a-z0-9_-]*)\.sql$/;

export interface SqlMigration {
  version: string;
  filename: string;
  checksum: string;
  sql: string;
}

export interface SqlMigrationLedgerRow {
  version: string;
  filename: string;
  checksum: string;
  executionMode: "ledger" | "baseline_verified";
}

export interface LedgerReconciliation {
  pending: SqlMigration[];
  changed: Array<{ migration: SqlMigration; ledger: SqlMigrationLedgerRow }>;
  orphaned: SqlMigrationLedgerRow[];
}

function checksum(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Lee el historial SQL versionado. El runner no interpreta ni genera SQL: cada
 * entrada corresponde a un archivo real, ordenado por versión y con su hash.
 */
export function loadSqlMigrations(directory: string): SqlMigration[] {
  const migrations: SqlMigration[] = [];

  for (const filename of readdirSync(directory).sort()) {
    if (!filename.endsWith(".sql")) continue;

    const match = filename.match(MIGRATION_FILENAME);
    const version = match?.[1];
    if (!version) {
      throw new Error(`Nombre de migración SQL inválido: ${filename}`);
    }

    const sql = readFileSync(join(directory, filename), "utf8");
    if (!sql.trim()) {
      throw new Error(`Migración SQL vacía: ${filename}`);
    }
    if (/\b(?:VACUUM|CREATE\s+INDEX\s+CONCURRENTLY)\b/i.test(sql)) {
      throw new Error(
        `La migración ${filename} no es compatible con el runner transaccional (VACUUM o CREATE INDEX CONCURRENTLY).`
      );
    }

    migrations.push({ version, filename, checksum: checksum(sql), sql });
  }

  if (migrations.length === 0) {
    throw new Error("No existen migraciones SQL versionadas.");
  }

  return migrations;
}

/**
 * Compara únicamente artefactos reales: un hash distinto bloquea la ejecución
 * y una fila sin archivo exige revisión manual, nunca una reparación tácita.
 */
export function reconcileSqlMigrationLedger(
  migrations: SqlMigration[],
  ledgerRows: SqlMigrationLedgerRow[]
): LedgerReconciliation {
  // El fichero es la identidad. El historial heredado contiene dos archivos
  // 0009_*, así que el prefijo numérico es solo el orden lógico, no una clave.
  const ledgerByFilename = new Map(
    ledgerRows.map((row) => [row.filename, row])
  );
  const migrationFilenames = new Set(
    migrations.map((migration) => migration.filename)
  );
  const pending: SqlMigration[] = [];
  const changed: LedgerReconciliation["changed"] = [];

  for (const migration of migrations) {
    const ledger = ledgerByFilename.get(migration.filename);
    if (!ledger) {
      pending.push(migration);
      continue;
    }

    if (
      ledger.version !== migration.version ||
      ledger.checksum !== migration.checksum
    ) {
      changed.push({ migration, ledger });
    }
  }

  const orphaned = ledgerRows.filter(
    (row) => !migrationFilenames.has(row.filename)
  );
  return { pending, changed, orphaned };
}

export function formatLedgerMismatch(
  reconciliation: LedgerReconciliation
): string[] {
  const errors: string[] = [];
  for (const { migration, ledger } of reconciliation.changed) {
    errors.push(
      `${migration.filename}: su versión o hash actual no coincide con el ledger.`
    );
  }
  for (const row of reconciliation.orphaned) {
    errors.push(`${row.filename}: existe en el ledger pero falta el archivo.`);
  }
  return errors;
}
