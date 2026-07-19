import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  academySportConfigs,
  apparatus,
  categories,
  competitionTypes,
  levels,
  programs,
  sportBranches,
  sportDisciplines,
  sportLocaleConfigs,
  terminologyDictionary,
} from "@/db/schema";

export async function getAcademySportConfigOptions(academyId: string) {
  const configs = await db
    .select({
      id: academySportConfigs.id,
      academyId: academySportConfigs.academyId,
      academyKind: academySportConfigs.academyKind,
      activeProgramCodes: academySportConfigs.activeProgramCodes,
      activeApparatusCodes: academySportConfigs.activeApparatusCodes,
      terminologyOverrides: academySportConfigs.terminologyOverrides,
      localeConfigId: sportLocaleConfigs.id,
      code: sportLocaleConfigs.code,
      name: sportLocaleConfigs.name,
      locale: sportLocaleConfigs.locale,
      configVersion: sportLocaleConfigs.configVersion,
      defaultAcademyType: sportLocaleConfigs.defaultAcademyType,
      defaultDisciplineVariant: sportLocaleConfigs.defaultDisciplineVariant,
      disciplineCode: sportDisciplines.code,
      disciplineName: sportDisciplines.name,
      branchCode: sportBranches.code,
      branchName: sportBranches.name,
      terminology: terminologyDictionary.terms,
    })
    .from(academySportConfigs)
    .innerJoin(sportLocaleConfigs, eq(academySportConfigs.sportLocaleConfigId, sportLocaleConfigs.id))
    .innerJoin(sportDisciplines, eq(sportLocaleConfigs.disciplineId, sportDisciplines.id))
    .innerJoin(sportBranches, eq(sportLocaleConfigs.branchId, sportBranches.id))
    .leftJoin(terminologyDictionary, eq(terminologyDictionary.sportLocaleConfigId, sportLocaleConfigs.id))
    .where(and(eq(academySportConfigs.academyId, academyId), eq(academySportConfigs.isActive, true)))
    .orderBy(asc(sportLocaleConfigs.name));

  if (configs.length === 0) return [];

  const localeConfigIds = configs.map((config) => config.localeConfigId);
  const [apparatusRows, programRows, levelRows, categoryRows, competitionRows] = await Promise.all([
    db
      .select()
      .from(apparatus)
      .where(inArray(apparatus.sportLocaleConfigId, localeConfigIds))
      .orderBy(asc(apparatus.sortOrder)),
    db
      .select()
      .from(programs)
      .where(inArray(programs.sportLocaleConfigId, localeConfigIds))
      .orderBy(asc(programs.sortOrder)),
    db
      .select()
      .from(levels)
      .where(inArray(levels.sportLocaleConfigId, localeConfigIds))
      .orderBy(asc(levels.sortOrder)),
    db
      .select()
      .from(categories)
      .where(inArray(categories.sportLocaleConfigId, localeConfigIds))
      .orderBy(asc(categories.sortOrder)),
    db
      .select()
      .from(competitionTypes)
      .where(inArray(competitionTypes.sportLocaleConfigId, localeConfigIds))
      .orderBy(asc(competitionTypes.sortOrder)),
  ]);

  return configs.map((config) => {
    const activeApparatusCodes = new Set(config.activeApparatusCodes ?? []);
    const activeProgramCodes = new Set(config.activeProgramCodes ?? []);

    return {
      ...config,
      terminology: {
        ...(config.terminology ?? {}),
        ...(config.terminologyOverrides ?? {}),
      },
      apparatus: apparatusRows.filter(
        (item) =>
          item.sportLocaleConfigId === config.localeConfigId &&
          (activeApparatusCodes.size === 0 || activeApparatusCodes.has(item.code))
      ),
      programs: programRows.filter(
        (item) =>
          item.sportLocaleConfigId === config.localeConfigId &&
          item.isActive &&
          (activeProgramCodes.size === 0 || activeProgramCodes.has(item.code))
      ),
      levels: levelRows.filter((item) => item.sportLocaleConfigId === config.localeConfigId && item.isActive),
      categories: categoryRows.filter(
        (item) => item.sportLocaleConfigId === config.localeConfigId && item.isActive
      ),
      competitionTypes: competitionRows.filter(
        (item) => item.sportLocaleConfigId === config.localeConfigId && item.isActive
      ),
    };
  });
}

export async function verifyAcademySportConfig(params: {
  academyId: string;
  tenantId: string;
  sportConfigId?: string | null;
}) {
  if (!params.sportConfigId) return null;

  const [row] = await db
    .select({
      id: academySportConfigs.id,
      academyId: academySportConfigs.academyId,
      tenantId: academySportConfigs.tenantId,
      activeProgramCodes: academySportConfigs.activeProgramCodes,
      activeApparatusCodes: academySportConfigs.activeApparatusCodes,
      localeConfigId: sportLocaleConfigs.id,
      defaultAcademyType: sportLocaleConfigs.defaultAcademyType,
      defaultDisciplineVariant: sportLocaleConfigs.defaultDisciplineVariant,
    })
    .from(academySportConfigs)
    .innerJoin(sportLocaleConfigs, eq(academySportConfigs.sportLocaleConfigId, sportLocaleConfigs.id))
    .where(
      and(
        eq(academySportConfigs.id, params.sportConfigId),
        eq(academySportConfigs.academyId, params.academyId),
        eq(academySportConfigs.tenantId, params.tenantId),
        eq(academySportConfigs.isActive, true)
      )
    )
    .limit(1);

  return row ?? null;
}
