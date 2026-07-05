import "dotenv/config";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/env";

// Verificación read-only: policies permisivas pendientes y tablas ORM vs DB real.
async function verifyPermissivePolicies() {
  const pool = new Pool({ connectionString: getDatabaseUrl() });

  try {
    const permissive = await pool.query(`
      SELECT tablename, policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (policyname ILIKE '%allow_authenticated%' OR qual = 'true')
      ORDER BY tablename, policyname;
    `);
    console.log(`Policies permisivas (allow_authenticated o USING true): ${permissive.rows.length}`);
    for (const r of permissive.rows) {
      console.log(`  - ${r.tablename} | ${r.policyname} | ${r.cmd}`);
    }

    const tables = await pool.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
    `);
    console.log(`\nTablas en schema public: ${tables.rows.length}`);
    console.log(tables.rows.map((r) => r.tablename).join(", "));

    const noRls = await pool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND rowsecurity = false
      ORDER BY tablename;
    `);
    console.log(`\nTablas SIN RLS habilitado: ${noRls.rows.length}`);
    for (const r of noRls.rows) console.log(`  - ${r.tablename}`);
  } finally {
    await pool.end();
  }
}

verifyPermissivePolicies().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
