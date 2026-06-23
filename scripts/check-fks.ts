/**
 * Verifica FKs existentes vs esperadas para tablas de eventos/clases/roles/scheduled.
 * Lista las FKs presentes y detecta las faltantes segun el schema Drizzle.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const caCertPath = process.env.NODE_EXTRA_CA_CERTS;
const ca = caCertPath && existsSync(resolve(caCertPath))
  ? readFileSync(resolve(caCertPath), "utf8")
  : undefined;

const TABLES_TO_CHECK = [
  "event_registrations",
  "event_waitlist",
  "event_categories",
  "event_payments",
  "class_waiting_list",
  "role_members",
  "scheduled_notifications",
  "message_history",
];

async function main() {
  const dbUrl = process.env.DATABASE_URL?.replace(/[?&]sslmode=[^&]*/g, "");
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: ca ? { ca, rejectUnauthorized: true } : false,
  });

  for (const table of TABLES_TO_CHECK) {
    const exists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [table]
    );
    if (exists.rows.length === 0) {
      console.log(`\n=== ${table}: NO EXISTE ===`);
      continue;
    }

    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [table]
    );
    const fks = await pool.query(
      `SELECT kcu.column_name, ccu.table_name AS foreign_table
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
       WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND tc.table_name=$1`,
      [table]
    );

    const fkMap = new Map<string, string>();
    for (const fk of fks.rows) {
      fkMap.set(fk.column_name, fk.foreign_table);
    }

    console.log(`\n=== ${table} ===`);
    console.log(`  columns: ${cols.rows.map((r) => r.column_name).join(", ")}`);
    console.log(`  FKs: ${[...fkMap.entries()].map(([c, t]) => `${c}->${t}`).join(", ") || "(none)"}`);

    const idLike = ["_id", "Id"];
    const candidates = cols.rows.filter((r) => idLike.some((s) => r.column_name.endsWith(s)));
    const missing = candidates.filter((r) => !fkMap.has(r.column_name));
    if (missing.length > 0) {
      console.log(`  *** MISSING FKs: ${missing.map((r) => r.column_name).join(", ")} ***`);
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
