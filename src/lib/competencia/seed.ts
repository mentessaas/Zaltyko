import seedFile from "@/content/competencia/semilla-2026-11.json";

import { CompetitiveSeedSchema, type CompetitiveSeed } from "./contracts";

/** Semilla versionada con los hallazgos de la investigación del 10-11-2026. */
export function loadCompetitiveSeed(): CompetitiveSeed {
  return CompetitiveSeedSchema.parse(seedFile);
}
