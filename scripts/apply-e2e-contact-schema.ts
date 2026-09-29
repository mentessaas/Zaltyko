import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

import { assertE2EProjectTarget } from "./lib/e2e-sandbox-target";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const expectedProjectRef = process.env.E2E_TARGET_SUPABASE_PROJECT_REF;

assertE2EProjectTarget({
  databaseUrl: databaseUrl ?? "",
  databaseUrlPool: process.env.DATABASE_URL_POOL,
  databaseUrlDirect: process.env.DATABASE_URL_DIRECT,
  supabaseUrl,
  expectedProjectRef,
});

if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260929130000_reconcile_contact_lead_interactions.sql"
  ),
  "utf8"
);

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

async function main() {
  const before = await pool.query<{ relation: string | null }>(
    "select to_regclass('public.lead_interactions')::text as relation"
  );
  if (!before.rows[0]?.relation) {
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }

  const after = await pool.query<{ relation: string | null; rls: boolean }>(
    `
      select c.relname as relation, c.relrowsecurity as rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'lead_interactions'
    `
  );
  if (after.rows[0]?.relation !== "lead_interactions" || !after.rows[0].rls) {
    throw new Error("Sandbox contact schema was not created with RLS enabled");
  }
  console.log("E2E contact schema ready with RLS enabled");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
