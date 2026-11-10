/* eslint-disable no-console */
/**
 * Carga la semilla de inteligencia competitiva (src/content/competencia) en las
 * tablas `ci_*`. Idempotente: solo inserta lo que falta y nunca pisa ediciones.
 *
 * Requiere que el candidato SQL esté aplicado en la base de DATABASE_URL:
 *   docs/deployment/candidates/20261110180000_competitive_intelligence_candidate.sql
 *
 * Por defecto solo acepta bases en loopback (localhost, 127.x, ::1). Para una
 * base alojada hay que pasar `--permitir-base-remota` y contar con la
 * autorización expresa de Elvis; nunca se ejecuta contra una base remota por
 * accidente.
 *
 * Uso: pnpm db:seed:competencia [-- --permitir-base-remota]
 */
import "dotenv/config";

import { checkSeedTarget } from "@/lib/competencia/seed-guard";

async function main() {
  const target = checkSeedTarget(
    process.env.DATABASE_URL,
    process.argv.slice(2)
  );
  if (!target.ok) {
    console.error(`Semilla de competencia cancelada: ${target.reason}`);
    process.exit(1);
  }
  if (target.remote) {
    console.warn(
      `Aviso: se va a escribir en una base remota (${target.host}) por ${"--permitir-base-remota"}.`
    );
  }

  // Importación diferida: no se abre ninguna conexión antes de validar el host.
  const { isCompetitiveIntelligenceAvailable } =
    await import("@/lib/competencia/storage");
  const { applyCompetitiveSeed } = await import("@/lib/competencia/mutations");
  const { loadCompetitiveSeed } = await import("@/lib/competencia/seed");

  if (!(await isCompetitiveIntelligenceAvailable())) {
    console.error(
      "Las tablas ci_* no existen en esta base. Aplica antes el candidato SQL " +
        "docs/deployment/candidates/20261110180000_competitive_intelligence_candidate.sql (con autorización)."
    );
    process.exit(1);
  }
  const seed = loadCompetitiveSeed();
  const report = await applyCompetitiveSeed(seed, null);
  console.log(`Semilla ${seed.version} aplicada:`, report);
  process.exit(0);
}

main().catch((error) => {
  console.error(
    "No se pudo aplicar la semilla de competencia:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
