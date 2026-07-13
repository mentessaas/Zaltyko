import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const APPROVED_PUBLIC_READ_POLICIES = new Set([
  "assessment_types:assessment_types_select",
  "featured_listings:featured_listings_select",
  "marketplace_ratings:marketplace_ratings_select",
  "template_age_categories:template_age_categories_select",
  "template_apparatus:template_apparatus_select",
  "template_competition_flow:template_competition_flow_select",
  "template_competition_levels:template_competition_levels_select",
  "template_license_config:template_license_config_select",
  "template_scoring_config:template_scoring_config_select",
  "templates:templates_select",
]);

interface PolicyRow {
  tablename: string;
  policyname: string;
  cmd: string;
  qual: string | null;
}

function getPool() {
  const databaseUrl =
    process.env.DATABASE_URL_POOL ??
    process.env.DATABASE_URL_DIRECT ??
    process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL, DATABASE_URL_POOL o DATABASE_URL_DIRECT es obligatoria."
    );
  }
  const caPath = process.env.NODE_EXTRA_CA_CERTS;
  const ca =
    caPath && existsSync(resolve(caPath))
      ? readFileSync(resolve(caPath), "utf8")
      : undefined;
  const hostname = new URL(databaseUrl).hostname;
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(hostname);

  if (!isLocal && !ca) {
    throw new Error(
      "NODE_EXTRA_CA_CERTS debe apuntar a la CA de Supabase para verificar políticas remotas."
    );
  }

  const connectionString = databaseUrl
    .replace(/([?&])sslmode=[^&]*&?/g, "$1")
    .replace(/[?&]$/, "");

  return new Pool({
    connectionString,
    ssl: isLocal ? false : { ca, rejectUnauthorized: true },
  });
}

// Verificación read-only: bloquea nuevas policies globales, salvo los diez
// catálogos/listados públicos que están revisados explícitamente.
async function verifyPermissivePolicies() {
  const pool = getPool();

  try {
    const permissive = await pool.query<PolicyRow>(`
      SELECT tablename, policyname, cmd, qual
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (policyname ILIKE '%allow_authenticated%' OR qual = 'true')
      ORDER BY tablename, policyname;
    `);
    const unexpected = permissive.rows.filter((policy) => {
      const key = `${policy.tablename}:${policy.policyname}`;
      return (
        policy.policyname.toLowerCase().includes("allow_authenticated") ||
        policy.cmd !== "SELECT" ||
        !APPROVED_PUBLIC_READ_POLICIES.has(key)
      );
    });

    console.log(`Policies globales detectadas: ${permissive.rows.length}`);
    for (const r of permissive.rows) {
      console.log(`  - ${r.tablename} | ${r.policyname} | ${r.cmd}`);
    }
    console.log(`Policies globales no aprobadas: ${unexpected.length}`);

    if (unexpected.length > 0) {
      for (const policy of unexpected) {
        console.error(
          `  - ${policy.tablename} | ${policy.policyname} | ${policy.cmd}`
        );
      }
      process.exitCode = 1;
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
