/* eslint-disable no-console */
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  academySportConfigs,
  apparatus,
  categories,
  competitionTypes,
  levels,
  programs,
  sportLocaleConfigs,
} from "@/db/schema";
import { SPORT_CONFIG_SEEDS, getSportConfigSeedByCode } from "@/lib/sport-config/catalog";
import { seedSportConfigurations } from "@/lib/sport-config/seed";

config({ path: ".env.local" });
config({ path: ".env" });

const shouldApply = process.argv.includes("--apply");

type ExistingConfig = {
  id: string;
  code: string;
  configVersion: string;
};

type AcademySelection = {
  id: string;
  academyId: string;
  configCode: string;
  activeProgramCodes: string[] | null;
  activeApparatusCodes: string[] | null;
};

function difference(left: string[], right: string[]) {
  const allowed = new Set(right);
  return left.filter((value) => !allowed.has(value));
}

function formatCodes(values: string[]) {
  return values.length > 0 ? values.join(", ") : "-";
}

async function activeCodesFor(configId: string) {
  const [programRows, levelRows, categoryRows, apparatusRows, competitionRows] = await Promise.all([
    db
      .select({ code: programs.code })
      .from(programs)
      .where(and(eq(programs.sportLocaleConfigId, configId), eq(programs.isActive, true))),
    db
      .select({ code: levels.code })
      .from(levels)
      .where(and(eq(levels.sportLocaleConfigId, configId), eq(levels.isActive, true))),
    db
      .select({ code: categories.code })
      .from(categories)
      .where(and(eq(categories.sportLocaleConfigId, configId), eq(categories.isActive, true))),
    db
      .select({ code: apparatus.code })
      .from(apparatus)
      .where(eq(apparatus.sportLocaleConfigId, configId)),
    db
      .select({ code: competitionTypes.code })
      .from(competitionTypes)
      .where(
        and(
          eq(competitionTypes.sportLocaleConfigId, configId),
          eq(competitionTypes.isActive, true)
        )
      ),
  ]);

  return {
    programs: programRows.map((row) => row.code),
    levels: levelRows.map((row) => row.code),
    categories: categoryRows.map((row) => row.code),
    apparatus: apparatusRows.map((row) => row.code),
    competitionTypes: competitionRows.map((row) => row.code),
  };
}

async function main() {
  const existingConfigs: ExistingConfig[] = await db
    .select({
      id: sportLocaleConfigs.id,
      code: sportLocaleConfigs.code,
      configVersion: sportLocaleConfigs.configVersion,
    })
    .from(sportLocaleConfigs);
  const existingByCode = new Map(existingConfigs.map((row) => [row.code, row]));

  console.log(`Sport config sync (${shouldApply ? "APPLY" : "DRY-RUN"})`);
  console.log("================================================");

  for (const seed of SPORT_CONFIG_SEEDS) {
    const existing = existingByCode.get(seed.code);
    if (!existing) {
      console.log(`${seed.code}: create ${seed.configVersion}`);
      continue;
    }

    const current = await activeCodesFor(existing.id);
    const next = {
      programs: seed.programs.map((item) => item.code),
      levels: seed.levels.map((item) => item.code),
      categories: seed.ageCategories.map((item) => item.code),
      apparatus: seed.evaluation.apparatus.map((item) => item.code),
      competitionTypes: seed.competitionTypes.map((item) => item.code),
    };

    console.log(`${seed.code}: ${existing.configVersion} -> ${seed.configVersion}`);
    for (const key of Object.keys(next) as Array<keyof typeof next>) {
      console.log(
        `  ${key}: add [${formatCodes(difference(next[key], current[key]))}] ` +
          `retire [${formatCodes(difference(current[key], next[key]))}]`
      );
    }
  }

  const academySelections: AcademySelection[] = await db
    .select({
      id: academySportConfigs.id,
      academyId: academySportConfigs.academyId,
      configCode: sportLocaleConfigs.code,
      activeProgramCodes: academySportConfigs.activeProgramCodes,
      activeApparatusCodes: academySportConfigs.activeApparatusCodes,
    })
    .from(academySportConfigs)
    .innerJoin(
      sportLocaleConfigs,
      eq(academySportConfigs.sportLocaleConfigId, sportLocaleConfigs.id)
    );

  const invalidSelections = academySelections.flatMap((selection) => {
    const seed = getSportConfigSeedByCode(selection.configCode);
    if (!seed) return [];
    const invalidPrograms = difference(
      selection.activeProgramCodes ?? [],
      seed.programs.map((item) => item.code)
    );
    const invalidApparatus = difference(
      selection.activeApparatusCodes ?? [],
      seed.evaluation.apparatus.map((item) => item.code)
    );
    return invalidPrograms.length > 0 || invalidApparatus.length > 0
      ? [{ ...selection, invalidPrograms, invalidApparatus }]
      : [];
  });

  if (invalidSelections.length > 0) {
    console.error("\nABORT: academy selections contain retired codes and require manual mapping:");
    for (const selection of invalidSelections) {
      console.error(
        `  ${selection.academyId} (${selection.configCode}) programs=[${formatCodes(
          selection.invalidPrograms
        )}] apparatus=[${formatCodes(selection.invalidApparatus)}]`
      );
    }
    process.exitCode = 2;
    return;
  }

  console.log(`\nAcademy selections checked: ${academySelections.length}; invalid: 0`);

  if (!shouldApply) {
    console.log("Dry-run complete. Re-run with --apply after reviewing this output.");
    return;
  }

  const synced = await seedSportConfigurations();

  for (const selection of academySelections) {
    const seed = getSportConfigSeedByCode(selection.configCode);
    if (!seed) continue;
    await db
      .update(academies)
      .set({
        federationConfigVersion: seed.configVersion,
        specializationStatus: seed.isGenericFallback ? "generic_fallback" : "configured",
      })
      .where(eq(academies.id, selection.academyId));
  }

  console.log(`Applied ${synced.length} catalog configurations.`);
  console.log(`Updated metadata for ${academySelections.length} academy configurations.`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
