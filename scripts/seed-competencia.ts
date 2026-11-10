/* eslint-disable no-console */
/**
 * Carga la semilla de inteligencia competitiva (src/content/competencia) en las
 * tablas `ci_*`. Idempotente: solo inserta lo que falta y nunca pisa ediciones.
 *
 * Requiere que el candidato SQL esté aplicado en la base de DATABASE_URL:
 *   docs/deployment/candidates/20261110180000_competitive_intelligence_candidate.sql
 * No ejecutar contra bases alojadas sin autorización expresa.
 *
 * Uso: pnpm db:seed:competencia
 */
import "dotenv/config";

import { applyCompetitiveSeed } from "@/lib/competencia/mutations";
import { loadCompetitiveSeed } from "@/lib/competencia/seed";
import { isCompetitiveIntelligenceAvailable } from "@/lib/competencia/storage";

async function main() {
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
