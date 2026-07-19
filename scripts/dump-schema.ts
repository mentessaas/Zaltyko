/**
 * Dump del schema real de la DB para diagnosticar drift entre Drizzle y SQL.
 * Solo lectura. Imprime column_name, data_type, is_nullable para tablas target.
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

const FK_QUERY = `
  SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
  ORDER BY tc.table_name, kcu.column_name;
`;

const TARGET_TABLES = [
  "__drizzle_migrations",
  "academy_diagnostics",
  "athlete_assessments",
  "coach_compensation",
  "academy_expenses",
  "billing_invoices",
  "churn_reasons",
  "leak_action_history",
];

async function main() {
  const dbUrl = process.env.DATABASE_URL?.replace(/[?&]sslmode=[^&]*/g, "");
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: ca ? { ca, rejectUnauthorized: true } : false,
  });

  for (const table of TARGET_TABLES) {
    console.log(`\n=== ${table} ===`);
    const result = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );

    if (result.rows.length === 0) {
      console.log("  (table does not exist)");
      continue;
    }

    for (const row of result.rows) {
      const nullable = row.is_nullable === "YES" ? "NULL" : "NOT NULL";
      const def = row.column_default ? ` DEFAULT ${row.column_default}` : "";
      console.log(`  ${row.column_name.padEnd(35)} ${row.data_type.padEnd(28)} ${nullable}${def}`);
    }
  }

  console.log("\n=== Foreign Keys ===");
  const fks = await pool.query(FK_QUERY);
  for (const row of fks.rows) {
    if (TARGET_TABLES.includes(row.table_name)) {
      console.log(
        `  ${row.table_name}.${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name} (${row.constraint_name})`
      );
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
