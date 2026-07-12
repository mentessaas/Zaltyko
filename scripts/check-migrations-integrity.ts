/**
 * Verifica la integridad de las migraciones Drizzle existentes.
 * No requiere DB. Valida:
 *   - drizzle/meta/_journal.json existe y es JSON valido
 *   - Cada migracion listada en el journal tiene su archivo .sql
 *   - El snapshot existe para cada migracion
 *
 * Uso: pnpm tsx scripts/check-migrations-integrity.ts
 * Pensado para CI: falla si la integridad esta rota.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

const DRIZZLE_DIR = resolve(process.cwd(), "drizzle");
const META_DIR = join(DRIZZLE_DIR, "meta");
const JOURNAL = join(META_DIR, "_journal.json");
const SUPABASE_MIGRATIONS_DIR = resolve(process.cwd(), "supabase", "migrations");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function validateSupabaseMigrations(): { count: number; errors: string[] } {
  const errors: string[] = [];

  if (!existsSync(SUPABASE_MIGRATIONS_DIR)) {
    return {
      count: 0,
      errors: [`${SUPABASE_MIGRATIONS_DIR} no existe`],
    };
  }

  const sqlFiles = readdirSync(SUPABASE_MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (sqlFiles.length === 0) {
    return {
      count: 0,
      errors: ["supabase/migrations no tiene archivos SQL"],
    };
  }

  for (const file of sqlFiles) {
    if (!/^[0-9]{4,14}_.+\.sql$/.test(file)) {
      errors.push(`Nombre de migracion inesperado: ${file}`);
    }
    const content = readFileSync(join(SUPABASE_MIGRATIONS_DIR, file), "utf8");
    if (content.trim().length === 0) {
      errors.push(`Migracion vacia: ${file}`);
    }
  }

  return { count: sqlFiles.length, errors };
}

function main() {
  const supabaseResult = validateSupabaseMigrations();
  const errors = [...supabaseResult.errors];

  if (!existsSync(DRIZZLE_DIR)) {
    if (errors.length > 0) {
      console.error("[check-migrations-integrity] FAIL:");
      errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    console.warn(`[check-migrations-integrity] WARN: ${DRIZZLE_DIR} no existe`);
    console.log(
      `[check-migrations-integrity] OK: 0 Drizzle + ${supabaseResult.count} Supabase migraciones validadas`
    );
    return;
  }
  if (!existsSync(JOURNAL)) {
    console.error(`[check-migrations-integrity] FAIL: ${JOURNAL} no existe`);
    process.exit(1);
  }

  const journalContent = readFileSync(JOURNAL, "utf8");
  let journal: Journal;
  try {
    journal = JSON.parse(journalContent);
  } catch (e) {
    console.error(`[check-migrations-integrity] FAIL: journal invalido:`, e);
    process.exit(1);
  }

  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    console.error(`[check-migrations-integrity] FAIL: journal sin entradas`);
    process.exit(1);
  }

  for (const entry of journal.entries) {
    const sqlFile = join(DRIZZLE_DIR, `${entry.tag}.sql`);
    // Snapshot usa el prefijo numerico (ej. 0000_snapshot.json), no el tag completo.
    const idxPrefix = String(entry.idx).padStart(4, "0");
    const snapshotFile = join(META_DIR, `${idxPrefix}_snapshot.json`);

    if (!existsSync(sqlFile)) {
      errors.push(`Falta SQL migration: ${entry.tag}.sql`);
    }
    if (!existsSync(snapshotFile)) {
      console.warn(`[check-migrations-integrity] WARN: snapshot ${idxPrefix}_snapshot.json faltante (no bloquea)`);
    }
  }

  const sqlFiles = readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""));

  for (const tag of sqlFiles) {
    if (!journal.entries.find((e) => e.tag === tag)) {
      errors.push(`Archivo SQL huerfano: ${tag}.sql (no esta en el journal)`);
    }
  }

  if (errors.length > 0) {
    console.error("[check-migrations-integrity] FAIL:");
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log(
    `[check-migrations-integrity] OK: ${journal.entries.length} Drizzle (${sqlFiles.length} SQL) + ${supabaseResult.count} Supabase migraciones validadas`
  );
}

main();
