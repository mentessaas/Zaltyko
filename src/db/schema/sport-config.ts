import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";

export type TerminologyDictionary = Record<string, string>;

export const countries = pgTable(
  "countries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    locale: text("locale").notNull().default("es-ES"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("countries_code_unique").on(table.code),
    activeIdx: index("countries_active_idx").on(table.isActive),
  })
);

export const sportDisciplines = pgTable(
  "sport_disciplines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("sport_disciplines_code_unique").on(table.code),
    activeIdx: index("sport_disciplines_active_idx").on(table.isActive),
  })
);

export const sportBranches = pgTable(
  "sport_branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    disciplineId: uuid("discipline_id")
      .notNull()
      .references(() => sportDisciplines.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("sport_branches_discipline_code_unique").on(
      table.disciplineId,
      table.code
    ),
    disciplineIdx: index("sport_branches_discipline_idx").on(table.disciplineId),
  })
);

export const sportLocaleConfigs = pgTable(
  "sport_locale_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "cascade" }),
    disciplineId: uuid("discipline_id")
      .notNull()
      .references(() => sportDisciplines.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => sportBranches.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    locale: text("locale").notNull().default("es-ES"),
    federation: text("federation"),
    configVersion: text("config_version").notNull().default("custom-v1"),
    defaultAcademyType: text("default_academy_type").notNull().default("general"),
    defaultDisciplineVariant: text("default_discipline_variant").notNull().default("general"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("sport_locale_configs_code_unique").on(table.code),
    countryDisciplineBranchUnique: uniqueIndex(
      "sport_locale_configs_country_discipline_branch_unique"
    ).on(table.countryId, table.disciplineId, table.branchId),
    countryIdx: index("sport_locale_configs_country_idx").on(table.countryId),
    branchIdx: index("sport_locale_configs_branch_idx").on(table.branchId),
  })
);

export const terminologyDictionary = pgTable(
  "terminology_dictionary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportLocaleConfigId: uuid("sport_locale_config_id")
      .notNull()
      .references(() => sportLocaleConfigs.id, { onDelete: "cascade" }),
    terms: jsonb("terms").$type<TerminologyDictionary>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    configUnique: uniqueIndex("terminology_dictionary_config_unique").on(
      table.sportLocaleConfigId
    ),
  })
);

export const apparatus = pgTable(
  "apparatus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportLocaleConfigId: uuid("sport_locale_config_id")
      .notNull()
      .references(() => sportLocaleConfigs.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    isOptional: boolean("is_optional").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    configCodeUnique: uniqueIndex("apparatus_config_code_unique").on(
      table.sportLocaleConfigId,
      table.code
    ),
    sortIdx: index("apparatus_config_sort_idx").on(table.sportLocaleConfigId, table.sortOrder),
  })
);

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportLocaleConfigId: uuid("sport_locale_config_id")
      .notNull()
      .references(() => sportLocaleConfigs.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    configCodeUnique: uniqueIndex("programs_config_code_unique").on(
      table.sportLocaleConfigId,
      table.code
    ),
    sortIdx: index("programs_config_sort_idx").on(table.sportLocaleConfigId, table.sortOrder),
  })
);

export const levels = pgTable(
  "levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportLocaleConfigId: uuid("sport_locale_config_id")
      .notNull()
      .references(() => sportLocaleConfigs.id, { onDelete: "cascade" }),
    programCode: text("program_code"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    configCodeUnique: uniqueIndex("levels_config_code_unique").on(
      table.sportLocaleConfigId,
      table.code
    ),
    configProgramIdx: index("levels_config_program_idx").on(
      table.sportLocaleConfigId,
      table.programCode
    ),
  })
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportLocaleConfigId: uuid("sport_locale_config_id")
      .notNull()
      .references(() => sportLocaleConfigs.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    configCodeUnique: uniqueIndex("categories_config_code_unique").on(
      table.sportLocaleConfigId,
      table.code
    ),
    sortIdx: index("categories_config_sort_idx").on(table.sportLocaleConfigId, table.sortOrder),
  })
);

export const competitionTypes = pgTable(
  "competition_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportLocaleConfigId: uuid("sport_locale_config_id")
      .notNull()
      .references(() => sportLocaleConfigs.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    configCodeUnique: uniqueIndex("competition_types_config_code_unique").on(
      table.sportLocaleConfigId,
      table.code
    ),
  })
);

export const academySportConfigs = pgTable(
  "academy_sport_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    sportLocaleConfigId: uuid("sport_locale_config_id")
      .notNull()
      .references(() => sportLocaleConfigs.id, { onDelete: "restrict" }),
    academyKind: text("academy_kind").notNull().default("mixed"),
    activeProgramCodes: text("active_program_codes").array(),
    activeApparatusCodes: text("active_apparatus_codes").array(),
    terminologyOverrides: jsonb("terminology_overrides").$type<TerminologyDictionary>(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    academyConfigUnique: uniqueIndex("academy_sport_configs_academy_config_unique").on(
      table.academyId,
      table.sportLocaleConfigId
    ),
    tenantAcademyIdx: index("academy_sport_configs_tenant_academy_idx").on(
      table.tenantId,
      table.academyId
    ),
    activeIdx: index("academy_sport_configs_active_idx").on(table.isActive),
  })
);

export type SportLocaleConfig = typeof sportLocaleConfigs.$inferSelect;
export type AcademySportConfig = typeof academySportConfigs.$inferSelect;
