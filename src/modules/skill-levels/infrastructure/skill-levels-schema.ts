import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  athletes,
  locations,
  organizationMembers,
  organizations,
  zaltyko,
} from "@/db/schema/zaltyko-core";

/**
 * Niveles y progresión por aparato.
 *
 * Espejo del candidato SQL
 * docs/deployment/candidates/20261114121000_skill_levels_candidate.sql, que
 * requiere autorización de Elvis y no está aplicado en ningún entorno.
 *
 * Igual que el precedente de objetivos y observaciones, NO se exporta desde
 * `src/db/schema/index.ts` ni desde `src/db/zaltyko-schema.ts`, y
 * `drizzle.config.ts` no lo lee: un `db:generate`/`push` crearía estas tablas
 * sin RLS ni REVOKE. Vive fuera de `src/db/schema/` porque `pnpm validate:rls`
 * solo valida el historial aplicado (`supabase/migrations`). Al promover el
 * candidato a una migración real, este archivo pasa a `src/db/schema/`.
 * Las claves foráneas a miembros del equipo y a sedes son `on delete set null
 * (columna)` en el SQL (Drizzle no expresa la lista de columnas): el espejo
 * solo las declara, y por eso esas columnas son opcionales.
 * tests/skill-levels-contract.test.ts comprueba que el candidato, este archivo
 * y la detección de almacenamiento describen las mismas tablas y columnas.
 */

/**
 * Las expresiones CHECK se escriben con el mismo texto que el candidato para
 * que el test de contrato las compare literalmente.
 */
const raw = (expression: string) => sql.raw(expression);

export const skillTemplates = zaltyko.table(
  "skill_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientRequestId: uuid("client_request_id").notNull(),
    discipline: text("discipline").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    source: text("source").notNull().default("blank"),
    starterKey: text("starter_key"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    revision: integer("revision").notNull().default(1),
    createdByMemberId: uuid("created_by_member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByMemberId: uuid("updated_by_member_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("skill_templates_org_id_uq").on(table.organizationId, table.id),
    unique("skill_templates_request_uq").on(table.organizationId, table.clientRequestId),
    index("skill_templates_org_idx").on(table.organizationId, table.discipline, table.archivedAt),
    index("skill_templates_created_by_idx").on(table.organizationId, table.createdByMemberId),
    index("skill_templates_updated_by_idx").on(table.organizationId, table.updatedByMemberId),
    check("skill_templates_name_check", raw("length(btrim(name)) between 2 and 80 and name !~ '[[:cntrl:]]'")),
    check(
      "skill_templates_description_check",
      raw("description is null or (length(description) <= 300 and description !~ '[[:cntrl:]]')")
    ),
    check(
      "skill_templates_discipline_check",
      raw("discipline in ('artistic_female', 'artistic_male', 'rhythmic')")
    ),
    check("skill_templates_source_check", raw("source in ('blank', 'starter', 'copy')")),
    check("skill_templates_starter_key_check", raw("(source = 'starter') = (starter_key is not null)")),
    check("skill_templates_revision_check", raw("revision > 0")),
    foreignKey({
      columns: [table.organizationId, table.createdByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.updatedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
  ]
);

export const skillLevels = zaltyko.table(
  "skill_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").notNull(),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("skill_levels_org_id_uq").on(table.organizationId, table.id),
    unique("skill_levels_org_template_id_uq").on(table.organizationId, table.templateId, table.id),
    index("skill_levels_template_idx").on(table.organizationId, table.templateId, table.position),
    check("skill_levels_position_check", raw("position > 0")),
    check("skill_levels_name_check", raw("length(btrim(name)) between 1 and 60 and name !~ '[[:cntrl:]]'")),
    check(
      "skill_levels_description_check",
      raw("description is null or (length(description) <= 300 and description !~ '[[:cntrl:]]')")
    ),
    foreignKey({
      columns: [table.organizationId, table.templateId],
      foreignColumns: [skillTemplates.organizationId, skillTemplates.id],
    }).onDelete("cascade"),
  ]
);

export const skillElements = zaltyko.table(
  "skill_elements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").notNull(),
    levelId: uuid("level_id").notNull(),
    position: integer("position").notNull(),
    apparatus: text("apparatus"),
    name: text("name").notNull(),
    description: text("description"),
    isRequired: boolean("is_required").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("skill_elements_org_id_uq").on(table.organizationId, table.id),
    unique("skill_elements_org_template_id_uq").on(table.organizationId, table.templateId, table.id),
    index("skill_elements_level_idx").on(
      table.organizationId,
      table.templateId,
      table.levelId,
      table.position
    ),
    check("skill_elements_position_check", raw("position > 0")),
    check("skill_elements_name_check", raw("length(btrim(name)) between 2 and 100 and name !~ '[[:cntrl:]]'")),
    check(
      "skill_elements_description_check",
      raw("description is null or (length(description) <= 300 and description !~ '[[:cntrl:]]')")
    ),
    check(
      "skill_elements_apparatus_check",
      raw(
        "apparatus is null or apparatus in ('vault', 'uneven_bars', 'beam', 'floor', 'pommel_horse', 'rings', 'parallel_bars', 'high_bar', 'rope', 'hoop', 'ball', 'clubs', 'ribbon', 'body')"
      )
    ),
    foreignKey({
      columns: [table.organizationId, table.templateId, table.levelId],
      foreignColumns: [skillLevels.organizationId, skillLevels.templateId, skillLevels.id],
    }).onDelete("cascade"),
  ]
);

export const athleteSkillProgress = zaltyko.table(
  "athlete_skill_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull(),
    templateId: uuid("template_id").notNull(),
    elementId: uuid("element_id").notNull(),
    locationId: uuid("location_id"),
    status: text("status").notNull().default("not_started"),
    achievedOn: date("achieved_on"),
    evaluatedByMemberId: uuid("evaluated_by_member_id"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("athlete_skill_progress_org_id_uq").on(table.organizationId, table.id),
    unique("athlete_skill_progress_element_uq").on(table.organizationId, table.athleteId, table.elementId),
    index("athlete_skill_progress_athlete_idx").on(table.organizationId, table.athleteId, table.templateId),
    index("athlete_skill_progress_location_idx").on(table.organizationId, table.locationId),
    index("athlete_skill_progress_evaluator_idx").on(table.organizationId, table.evaluatedByMemberId),
    check(
      "athlete_skill_progress_status_check",
      raw("status in ('not_started', 'in_progress', 'achieved')")
    ),
    check(
      "athlete_skill_progress_achieved_on_check",
      raw("(status = 'achieved') = (achieved_on is not null)")
    ),
    check("athlete_skill_progress_revision_check", raw("revision > 0")),
    foreignKey({
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.templateId, table.elementId],
      foreignColumns: [skillElements.organizationId, skillElements.templateId, skillElements.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.evaluatedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
  ]
);

export const athleteLevelPasses = zaltyko.table(
  "athlete_level_passes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull(),
    templateId: uuid("template_id").notNull(),
    levelId: uuid("level_id").notNull(),
    locationId: uuid("location_id"),
    clientRequestId: uuid("client_request_id").notNull(),
    passedOn: date("passed_on").notNull(),
    passedByMemberId: uuid("passed_by_member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("athlete_level_passes_org_id_uq").on(table.organizationId, table.id),
    unique("athlete_level_passes_request_uq").on(table.organizationId, table.clientRequestId),
    unique("athlete_level_passes_level_uq").on(table.organizationId, table.athleteId, table.levelId),
    index("athlete_level_passes_athlete_idx").on(table.organizationId, table.athleteId, table.templateId),
    index("athlete_level_passes_location_idx").on(table.organizationId, table.locationId),
    index("athlete_level_passes_passer_idx").on(table.organizationId, table.passedByMemberId),
    foreignKey({
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.templateId, table.levelId],
      foreignColumns: [skillLevels.organizationId, skillLevels.templateId, skillLevels.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.passedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
  ]
);

export type SkillTemplateRow = typeof skillTemplates.$inferSelect;
export type SkillLevelRow = typeof skillLevels.$inferSelect;
export type SkillElementRow = typeof skillElements.$inferSelect;
export type AthleteSkillProgressRow = typeof athleteSkillProgress.$inferSelect;
export type AthleteLevelPassRow = typeof athleteLevelPasses.$inferSelect;
