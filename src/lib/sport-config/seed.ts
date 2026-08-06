import { and, eq, notInArray } from "drizzle-orm";

import { db } from "@/db";
import {
  academySportConfigs,
  apparatus,
  categories,
  competitionTypes,
  countries,
  levels,
  programs,
  sportBranches,
  sportDisciplines,
  sportLocaleConfigs,
  terminologyDictionary,
} from "@/db/schema";
import {
  SPORT_CONFIG_SEEDS,
  filterSeedCodes,
  getSportConfigSeedByVariant,
} from "./catalog";
import type { DatabaseClient } from "@/lib/db-transactions";

async function ensureCountry(
  seed: (typeof SPORT_CONFIG_SEEDS)[number]["country"],
  client: DatabaseClient
) {
  const [row] = await client
    .insert(countries)
    .values({
      code: seed.code,
      name: seed.name,
      locale: seed.locale,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: countries.code,
      set: { name: seed.name, locale: seed.locale, isActive: true },
    })
    .returning();
  return row;
}

async function ensureDiscipline(
  seed: (typeof SPORT_CONFIG_SEEDS)[number]["discipline"],
  client: DatabaseClient
) {
  const [row] = await client
    .insert(sportDisciplines)
    .values({ code: seed.code, name: seed.name, isActive: true })
    .onConflictDoUpdate({
      target: sportDisciplines.code,
      set: { name: seed.name, isActive: true },
    })
    .returning();
  return row;
}

async function ensureBranch(
  disciplineId: string,
  seed: (typeof SPORT_CONFIG_SEEDS)[number]["branch"],
  client: DatabaseClient
) {
  const [existing] = await client
    .select()
    .from(sportBranches)
    .where(
      and(
        eq(sportBranches.disciplineId, disciplineId),
        eq(sportBranches.code, seed.code)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await client
      .update(sportBranches)
      .set({ name: seed.name, isActive: true })
      .where(eq(sportBranches.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await client
    .insert(sportBranches)
    .values({ disciplineId, code: seed.code, name: seed.name, isActive: true })
    .returning();
  return created;
}

export async function seedSportConfigurations(client: DatabaseClient = db) {
  const rows = [];

  for (const seed of SPORT_CONFIG_SEEDS) {
    const country = await ensureCountry(seed.country, client);
    const discipline = await ensureDiscipline(seed.discipline, client);
    const branch = await ensureBranch(discipline.id, seed.branch, client);

    const [config] = await client
      .insert(sportLocaleConfigs)
      .values({
        countryId: country.id,
        disciplineId: discipline.id,
        branchId: branch.id,
        code: seed.code,
        name: seed.name,
        locale: seed.country.locale,
        federation: seed.federation,
        configVersion: seed.configVersion,
        defaultAcademyType: seed.defaultAcademyType,
        defaultDisciplineVariant: seed.defaultDisciplineVariant,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: sportLocaleConfigs.code,
        set: {
          name: seed.name,
          locale: seed.country.locale,
          federation: seed.federation,
          configVersion: seed.configVersion,
          defaultAcademyType: seed.defaultAcademyType,
          defaultDisciplineVariant: seed.defaultDisciplineVariant,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    await client
      .insert(terminologyDictionary)
      .values({ sportLocaleConfigId: config.id, terms: seed.terminology })
      .onConflictDoUpdate({
        target: terminologyDictionary.sportLocaleConfigId,
        set: { terms: seed.terminology, updatedAt: new Date() },
      });

    for (const [index, item] of seed.evaluation.apparatus.entries()) {
      await client
        .insert(apparatus)
        .values({
          sportLocaleConfigId: config.id,
          code: item.code,
          name: item.label,
          shortName: item.code.toUpperCase(),
          sortOrder: index + 1,
        })
        .onConflictDoUpdate({
          target: [apparatus.sportLocaleConfigId, apparatus.code],
          set: {
            name: item.label,
            shortName: item.code.toUpperCase(),
            sortOrder: index + 1,
          },
        });
    }

    for (const [index, item] of seed.programs.entries()) {
      await client
        .insert(programs)
        .values({
          sportLocaleConfigId: config.id,
          code: item.code,
          name: item.name,
          description: item.description,
          sortOrder: index + 1,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [programs.sportLocaleConfigId, programs.code],
          set: {
            name: item.name,
            description: item.description,
            sortOrder: index + 1,
            isActive: true,
          },
        });
    }

    for (const [index, item] of seed.levels.entries()) {
      await client
        .insert(levels)
        .values({
          sportLocaleConfigId: config.id,
          programCode: item.programCode,
          code: item.code,
          name: item.name,
          sortOrder: index + 1,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [levels.sportLocaleConfigId, levels.code],
          set: {
            name: item.name,
            programCode: item.programCode,
            sortOrder: index + 1,
            isActive: true,
          },
        });
    }

    for (const [index, item] of seed.ageCategories.entries()) {
      await client
        .insert(categories)
        .values({
          sportLocaleConfigId: config.id,
          code: item.code,
          name: item.name,
          minAge: item.minAge,
          maxAge: item.maxAge,
          sortOrder: index + 1,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [categories.sportLocaleConfigId, categories.code],
          set: {
            name: item.name,
            minAge: item.minAge,
            maxAge: item.maxAge,
            sortOrder: index + 1,
            isActive: true,
          },
        });
    }

    for (const [index, item] of seed.competitionTypes.entries()) {
      await client
        .insert(competitionTypes)
        .values({
          sportLocaleConfigId: config.id,
          code: item.code,
          name: item.name,
          sortOrder: index + 1,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [competitionTypes.sportLocaleConfigId, competitionTypes.code],
          set: { name: item.name, sortOrder: index + 1, isActive: true },
        });
    }

    // The catalog is versioned reference data. Upserts alone leave removed
    // federation codes active forever, so retire anything that is no longer
    // present in the current seed while preserving the rows for historical
    // references and auditability.
    await client
      .update(programs)
      .set({ isActive: false })
      .where(
        and(
          eq(programs.sportLocaleConfigId, config.id),
          notInArray(
            programs.code,
            seed.programs.map((item) => item.code)
          )
        )
      );

    await client
      .update(levels)
      .set({ isActive: false })
      .where(
        and(
          eq(levels.sportLocaleConfigId, config.id),
          notInArray(
            levels.code,
            seed.levels.map((item) => item.code)
          )
        )
      );

    await client
      .update(categories)
      .set({ isActive: false })
      .where(
        and(
          eq(categories.sportLocaleConfigId, config.id),
          notInArray(
            categories.code,
            seed.ageCategories.map((item) => item.code)
          )
        )
      );

    await client
      .update(competitionTypes)
      .set({ isActive: false })
      .where(
        and(
          eq(competitionTypes.sportLocaleConfigId, config.id),
          notInArray(
            competitionTypes.code,
            seed.competitionTypes.map((item) => item.code)
          )
        )
      );

    rows.push(config);
  }

  return rows;
}

export async function activateAcademySportConfig(
  params: {
    tenantId: string;
    academyId: string;
    countryCode?: string | null;
    disciplineVariant: string;
    academyKind?: "recreational" | "competitive" | "mixed";
    activeProgramCodes?: string[] | null;
    activeApparatusCodes?: string[] | null;
    terminologyOverrides?: Record<string, string> | null;
  },
  client: DatabaseClient = db
) {
  await seedSportConfigurations(client);

  const seed = getSportConfigSeedByVariant(
    params.countryCode ?? "ES",
    params.disciplineVariant
  );
  if (!seed) return null;

  const [localeConfig] = await client
    .select()
    .from(sportLocaleConfigs)
    .where(eq(sportLocaleConfigs.code, seed.code))
    .limit(1);

  if (!localeConfig) return null;

  const activeProgramCodes = filterSeedCodes(
    seed.programs,
    params.activeProgramCodes
  );
  const activeApparatusCodes = filterSeedCodes(
    seed.evaluation.apparatus,
    params.activeApparatusCodes
  );
  const terminologyOverrideValues =
    params.terminologyOverrides !== undefined
      ? { terminologyOverrides: params.terminologyOverrides }
      : {};

  const [active] = await client
    .insert(academySportConfigs)
    .values({
      tenantId: params.tenantId,
      academyId: params.academyId,
      sportLocaleConfigId: localeConfig.id,
      academyKind: params.academyKind ?? "mixed",
      activeProgramCodes,
      activeApparatusCodes,
      ...terminologyOverrideValues,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [
        academySportConfigs.academyId,
        academySportConfigs.sportLocaleConfigId,
      ],
      set: {
        academyKind: params.academyKind ?? "mixed",
        activeProgramCodes,
        activeApparatusCodes,
        ...terminologyOverrideValues,
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return {
    ...active,
    isGenericFallback: seed.isGenericFallback ?? false,
    configVersion: seed.configVersion,
  };
}
