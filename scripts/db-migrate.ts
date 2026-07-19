/**
 * Wrapper para db:migrate que:
 * 1. Carga .env.local
 * 2. Resuelve NODE_EXTRA_CA_CERTS a ruta absoluta
 * 3. Ejecuta drizzle-kit push con env vars correctas
 *
 * Necesario porque drizzle-kit carga su config antes de que pg lea
 * NODE_EXTRA_CA_CERTS, y las rutas relativas no funcionan con tls.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { spawnSync } from "child_process";

config({ path: ".env.local" });
config({ path: ".env" });

if (process.env.NODE_EXTRA_CA_CERTS) {
  process.env.NODE_EXTRA_CA_CERTS = resolve(process.env.NODE_EXTRA_CA_CERTS);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[db:migrate] DATABASE_URL no está definida.");
  process.exit(1);
}

let databaseHostname: string;
try {
  databaseHostname = new URL(databaseUrl).hostname;
} catch {
  console.error("[db:migrate] DATABASE_URL no es una URL PostgreSQL válida.");
  process.exit(1);
}

const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!localDatabaseHosts.has(databaseHostname)) {
  console.error(
    "[db:migrate] Bloqueado: drizzle-kit push no se ejecuta contra bases remotas."
  );
  console.error(
    "[db:migrate] Revisa el SQL y aplica una migración versionada con:"
  );
  console.error(
    "pnpm db:migrate:reviewed supabase/migrations/<timestamp>_<nombre>.sql"
  );
  process.exit(1);
}

const result = spawnSync("npx", ["drizzle-kit", "push"], {
  stdio: "inherit",
  env: process.env,
  shell: false,
});

process.exit(result.status ?? 1);
