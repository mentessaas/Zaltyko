import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  athletes,
  locations,
  organizationMembers,
  organizations,
  sessions,
  zaltyko,
} from "@/db/schema/zaltyko-core";

/**
 * P2 #17 (primera parte): objetivos y observaciones por gimnasta.
 *
 * Espejo del candidato SQL
 * docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql,
 * que requiere autorización de Elvis y no está aplicado en ningún entorno.
 *
 * Igual que el precedente de la PR 266, NO se exporta desde `src/db/schema/index.ts`
 * ni desde `src/db/zaltyko-schema.ts`, y `drizzle.config.ts` no lo lee: un
 * `db:generate`/`push` crearía estas tablas sin RLS ni REVOKE. Además vive fuera
 * de `src/db/schema/` porque `pnpm validate:rls` solo valida el historial
 * aplicado (`supabase/migrations`) y estas tablas, con `organization_id`, todavía
 * no forman parte de él. Al promover el candidato a una migración real, este
 * archivo pasa a `src/db/schema/` y la migración debe superar `validate:rls`.
 * tests/athlete-progress-contract.test.ts comprueba que el candidato, este
 * archivo y la detección de almacenamiento describen las mismas tablas y columnas.
 */

export const athleteObjectives = zaltyko.table(
  "athlete_objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull(),
    locationId: uuid("location_id").notNull(),
    clientRequestId: uuid("client_request_id").notNull(),
    title: text("title").notNull(),
    discipline: text("discipline"),
    apparatus: text("apparatus"),
    targetDate: date("target_date"),
    status: text("status").notNull().default("in_progress"),
    createdByMemberId: uuid("created_by_member_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    statusChangedByMemberId: uuid("status_changed_by_member_id").notNull(),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    revision: integer("revision").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("athlete_objectives_organization_id_id_key").on(table.organizationId, table.id),
    uniqueIndex("athlete_objectives_organization_id_athlete_id_id_key").on(
      table.organizationId,
      table.athleteId,
      table.id
    ),
    uniqueIndex("athlete_objectives_organization_id_client_request_id_key").on(
      table.organizationId,
      table.clientRequestId
    ),
    index("athlete_objectives_athlete_idx").on(
      table.organizationId,
      table.athleteId,
      table.status,
      table.createdAt
    ),
    check("athlete_objectives_status_check", sql`${table.status} in ('in_progress', 'achieved', 'discarded')`),
    check("athlete_objectives_revision_check", sql`${table.revision} > 0`),
    foreignKey({
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.createdByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.statusChangedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
  ]
);

export const athleteObjectiveStatusHistory = zaltyko.table(
  "athlete_objective_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id").notNull(),
    revision: integer("revision").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedByMemberId: uuid("changed_by_member_id").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("athlete_objective_status_history_organization_id_objective_id_revision_key").on(
      table.organizationId,
      table.objectiveId,
      table.revision
    ),
    foreignKey({
      columns: [table.organizationId, table.objectiveId],
      foreignColumns: [athleteObjectives.organizationId, athleteObjectives.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.changedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
  ]
);

export const athleteObservations = zaltyko.table(
  "athlete_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull(),
    locationId: uuid("location_id").notNull(),
    clientRequestId: uuid("client_request_id").notNull(),
    body: text("body").notNull(),
    visibility: text("visibility").notNull().default("team"),
    observedOn: date("observed_on").notNull(),
    sessionId: uuid("session_id"),
    objectiveId: uuid("objective_id"),
    authorMemberId: uuid("author_member_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByMemberId: uuid("updated_by_member_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    revision: integer("revision").notNull().default(1),
  },
  (table) => [
    uniqueIndex("athlete_observations_organization_id_id_key").on(table.organizationId, table.id),
    uniqueIndex("athlete_observations_organization_id_client_request_id_key").on(
      table.organizationId,
      table.clientRequestId
    ),
    index("athlete_observations_athlete_idx").on(
      table.organizationId,
      table.athleteId,
      table.observedOn,
      table.createdAt
    ),
    check("athlete_observations_visibility_check", sql`${table.visibility} in ('team', 'family')`),
    check("athlete_observations_revision_check", sql`${table.revision} > 0`),
    foreignKey({
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.locationId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.locationId, sessions.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.athleteId, table.objectiveId],
      foreignColumns: [athleteObjectives.organizationId, athleteObjectives.athleteId, athleteObjectives.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.authorMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
    foreignKey({
      columns: [table.organizationId, table.updatedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
  ]
);

export type AthleteObjectiveRow = typeof athleteObjectives.$inferSelect;
export type AthleteObjectiveStatusHistoryRow = typeof athleteObjectiveStatusHistory.$inferSelect;
export type AthleteObservationRow = typeof athleteObservations.$inferSelect;
