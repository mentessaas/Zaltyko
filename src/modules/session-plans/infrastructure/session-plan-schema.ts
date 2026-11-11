import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  classTemplates,
  locations,
  organizationMembers,
  organizations,
  sessions,
  zaltyko,
} from "@/db/schema/zaltyko-core";
import { athleteObjectives } from "@/modules/athlete-progress/infrastructure/athlete-progress-schema";

/**
 * P2 #17 (segunda parte): planificación sobre sesiones.
 *
 * Espejo del candidato SQL
 * docs/deployment/candidates/20261111200000_session_plans_candidate.sql,
 * que requiere autorización de Elvis y no está aplicado en ningún entorno.
 *
 * Igual que athlete-progress-schema.ts, NO se exporta desde `src/db/schema/index.ts`
 * ni desde `src/db/zaltyko-schema.ts`, y `drizzle.config.ts` no lo lee: un
 * `db:generate`/`push` crearía estas tablas sin RLS ni REVOKE. Vive fuera de
 * `src/db/schema/` porque `pnpm validate:rls` solo valida el historial aplicado.
 * tests/session-plans-contract.test.ts comprueba que el candidato, este archivo
 * y la detección de almacenamiento describen las mismas tablas y columnas.
 */

/** Las expresiones CHECK usan el mismo texto que el candidato. */
const raw = (expression: string) => sql.raw(expression);

export const sessionPlans = zaltyko.table(
  "session_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    clientRequestId: uuid("client_request_id").notNull(),
    focus: text("focus"),
    note: text("note"),
    fromTemplateRevision: integer("from_template_revision"),
    revision: integer("revision").notNull().default(1),
    createdByMemberId: uuid("created_by_member_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByMemberId: uuid("updated_by_member_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("session_plans_org_id_uq").on(table.organizationId, table.id),
    unique("session_plans_session_uq").on(table.organizationId, table.sessionId),
    unique("session_plans_request_uq").on(table.organizationId, table.clientRequestId),
    check(
      "session_plans_focus_check",
      raw("focus is null or (length(btrim(focus)) >= 1 and length(focus) <= 200)")
    ),
    check("session_plans_note_check", raw("note is null or length(note) <= 1000")),
    check(
      "session_plans_template_revision_check",
      raw("from_template_revision is null or from_template_revision > 0")
    ),
    check("session_plans_revision_check", raw("revision > 0")),
    foreignKey({
      columns: [table.organizationId, table.locationId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.locationId, sessions.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
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

export const sessionPlanBlocks = zaltyko.table(
  "session_plan_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull(),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    discipline: text("discipline"),
    apparatus: text("apparatus"),
    content: text("content").notNull(),
    durationMinutes: integer("duration_minutes"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneByMemberId: uuid("done_by_member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("session_plan_blocks_org_id_uq").on(table.organizationId, table.id),
    unique("session_plan_blocks_position_uq").on(table.organizationId, table.planId, table.position),
    check("session_plan_blocks_position_check", raw("position >= 1 and position <= 20")),
    check(
      "session_plan_blocks_kind_check",
      raw("kind in ('warmup', 'technique', 'conditioning', 'flexibility', 'choreography', 'cooldown', 'other')")
    ),
    check(
      "session_plan_blocks_discipline_check",
      raw("discipline is null or discipline in ('gaf', 'gam', 'gr')")
    ),
    check(
      "session_plan_blocks_apparatus_check",
      raw(
        "apparatus is null or (discipline = 'gaf' and apparatus in ('vault', 'uneven_bars', 'beam', 'floor')) or (discipline = 'gam' and apparatus in ('floor', 'pommel_horse', 'rings', 'vault', 'parallel_bars', 'high_bar')) or (discipline = 'gr' and apparatus in ('freehand', 'rope', 'hoop', 'ball', 'clubs', 'ribbon'))"
      )
    ),
    check(
      "session_plan_blocks_content_check",
      raw("length(btrim(content)) >= 1 and length(content) <= 300")
    ),
    check(
      "session_plan_blocks_duration_check",
      raw("duration_minutes is null or (duration_minutes >= 1 and duration_minutes <= 240)")
    ),
    check(
      "session_plan_blocks_done_check",
      raw(
        "(done_at is null and done_by_member_id is null) or (done_at is not null and done_by_member_id is not null)"
      )
    ),
    foreignKey({
      columns: [table.organizationId, table.planId],
      foreignColumns: [sessionPlans.organizationId, sessionPlans.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.doneByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
  ]
);

export const sessionPlanObjectives = zaltyko.table(
  "session_plan_objectives",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull(),
    athleteId: uuid("athlete_id").notNull(),
    objectiveId: uuid("objective_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "session_plan_objectives_pkey",
      columns: [table.organizationId, table.planId, table.objectiveId],
    }),
    index("session_plan_objectives_objective_idx").on(table.organizationId, table.objectiveId),
    foreignKey({
      columns: [table.organizationId, table.planId],
      foreignColumns: [sessionPlans.organizationId, sessionPlans.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.athleteId, table.objectiveId],
      foreignColumns: [athleteObjectives.organizationId, athleteObjectives.athleteId, athleteObjectives.id],
    }).onDelete("cascade"),
  ]
);

export const classPlanTemplates = zaltyko.table(
  "class_plan_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    classTemplateId: uuid("class_template_id").notNull(),
    focus: text("focus"),
    note: text("note"),
    blocks: jsonb("blocks").notNull().default(sql`'[]'::jsonb`),
    revision: integer("revision").notNull().default(1),
    updatedByMemberId: uuid("updated_by_member_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("class_plan_templates_org_id_uq").on(table.organizationId, table.id),
    unique("class_plan_templates_class_uq").on(table.organizationId, table.classTemplateId),
    check(
      "class_plan_templates_focus_check",
      raw("focus is null or (length(btrim(focus)) >= 1 and length(focus) <= 200)")
    ),
    check("class_plan_templates_note_check", raw("note is null or length(note) <= 1000")),
    check(
      "class_plan_templates_blocks_check",
      raw("jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 20")
    ),
    check("class_plan_templates_revision_check", raw("revision > 0")),
    foreignKey({
      columns: [table.organizationId, table.locationId, table.classTemplateId],
      foreignColumns: [classTemplates.organizationId, classTemplates.locationId, classTemplates.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.updatedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
  ]
);

export type SessionPlanRow = typeof sessionPlans.$inferSelect;
export type SessionPlanBlockRow = typeof sessionPlanBlocks.$inferSelect;
export type ClassPlanTemplateRow = typeof classPlanTemplates.$inferSelect;
