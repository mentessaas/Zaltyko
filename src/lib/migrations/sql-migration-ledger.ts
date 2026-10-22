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

function splitSqlStatements(sql: string, filename: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let index = 0;

  while (index < sql.length) {
    if (sql.startsWith("--", index)) {
      const newline = sql.indexOf("\n", index + 2);
      index = newline === -1 ? sql.length : newline + 1;
      continue;
    }

    if (sql.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (sql.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      if (depth > 0) {
        throw new Error("Comentario SQL sin cerrar en " + filename + ".");
      }
      continue;
    }

    if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index];
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === quote && sql[index + 1] === quote) {
          index += 2;
        } else if (sql[index] === quote) {
          index += 1;
          closed = true;
          break;
        } else if (sql[index] === "\\" && quote === "'") {
          index += 2;
        } else {
          index += 1;
        }
      }
      if (!closed) {
        throw new Error("Literal SQL sin cerrar en " + filename + ".");
      }
      continue;
    }

    if (sql[index] === "$") {
      const delimiter = sql.slice(index).match(/^\$[A-Za-z_0-9]*\$/)?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, index + delimiter.length);
        if (end === -1) {
          throw new Error(
            "Bloque dollar-quoted sin cerrar en " + filename + "."
          );
        }
        index = end + delimiter.length;
        continue;
      }
    }

    if (sql[index] === ";") {
      statements.push(sql.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }

  statements.push(sql.slice(start));
  return statements.filter((statement) => statement.trim().length > 0);
}

function firstWords(statement: string): string[] {
  const words: string[] = [];
  let index = 0;

  const skipTrivia = () => {
    while (index < statement.length) {
      if (/\s/.test(statement[index])) {
        index += 1;
      } else if (statement.startsWith("--", index)) {
        const newline = statement.indexOf("\n", index + 2);
        index = newline === -1 ? statement.length : newline + 1;
      } else if (statement.startsWith("/*", index)) {
        let depth = 1;
        index += 2;
        while (index < statement.length && depth > 0) {
          if (statement.startsWith("/*", index)) {
            depth += 1;
            index += 2;
          } else if (statement.startsWith("*/", index)) {
            depth -= 1;
            index += 2;
          } else {
            index += 1;
          }
        }
      } else {
        break;
      }
    }
  };

  while (words.length < 2) {
    skipTrivia();
    const match = statement.slice(index).match(/^[A-Za-z_][A-Za-z_0-9$]*/);
    if (!match) break;
    words.push(match[0].toUpperCase());
    index += match[0].length;
  }
  return words;
}

function isTransactionStart(words: string[]) {
  return (
    words[0] === "BEGIN" || (words[0] === "START" && words[1] === "TRANSACTION")
  );
}

function isTransactionEnd(words: string[]) {
  return words[0] === "COMMIT" || words[0] === "END";
}

function isTransactionControl(words: string[]) {
  return (
    isTransactionStart(words) ||
    isTransactionEnd(words) ||
    ["ROLLBACK", "ABORT", "SAVEPOINT", "RELEASE"].includes(words[0]) ||
    (words[0] === "PREPARE" && words[1] === "TRANSACTION")
  );
}

/**
 * The runner owns the transaction that applies a migration and records its
 * ledger row. Allow a legacy outer BEGIN/COMMIT pair, but remove that wrapper
 * before execution so the DDL and ledger insert remain atomic together.
 */
export function prepareMigrationSqlForRunner(sql: string, filename: string) {
  const statements = splitSqlStatements(sql, filename);
  if (statements.length === 0) {
    throw new Error("Migración SQL vacía: " + filename);
  }

  const first = firstWords(statements[0]);
  const last = firstWords(statements[statements.length - 1]);
  const hasStart = isTransactionStart(first);
  const hasEnd = isTransactionEnd(last);

  let body = statements;
  if (hasStart || hasEnd) {
    if (!hasStart || !hasEnd || statements.length < 3) {
      throw new Error(
        "La migración " +
          filename +
          " debe dejar el control transaccional al runner."
      );
    }
    body = statements.slice(1, -1);
  }

  if (body.some((statement) => isTransactionControl(firstWords(statement)))) {
    throw new Error(
      "La migración " +
        filename +
        " contiene control transaccional dentro del SQL."
    );
  }

  return body.join(";\n");
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
    prepareMigrationSqlForRunner(sql, filename);

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
      `${migration.filename}: su versión o hash actual no coincide con el ledger (archivo=${migration.version}, ledger=${ledger.version}).`
    );
  }
  for (const row of reconciliation.orphaned) {
    errors.push(`${row.filename}: existe en el ledger pero falta el archivo.`);
  }
  return errors;
}
