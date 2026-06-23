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

const result = spawnSync("npx", ["drizzle-kit", "push"], {
  stdio: "inherit",
  env: process.env,
  shell: false,
});

process.exit(result.status ?? 1);
