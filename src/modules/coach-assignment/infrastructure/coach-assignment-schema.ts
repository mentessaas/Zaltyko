import { sql } from "drizzle-orm";
import { check, foreignKey, index, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import {
  classTemplates,
  organizationMembers,
  organizations,
  sessions,
  staffProfiles,
  zaltyko,
} from "@/db/schema/zaltyko-core";

/**
 * O1: entrenadora titular por clase y sustitución por sesión.
 *
 * Espejo del candidato SQL
 * docs/deployment/candidates/20261111180000_coach_assignment_candidate.sql,
 * que requiere autorización de Elvis y no está aplicado en ningún entorno.
 *
 * Igual que los precedentes de las PR 266 y 271, NO se exporta desde
 * `src/db/schema/index.ts` ni desde `src/db/zaltyko-schema.ts`, y
 * `drizzle.config.ts` no lo lee: un `db:generate`/`push` crearía estas tablas
 * sin RLS ni REVOKE. Vive fuera de `src/db/schema/` porque `pnpm validate:rls`
 * solo valida el historial aplicado (`supabase/migrations`). Al promover el
 * candidato a una migración real, este archivo pasa a `src/db/schema/` y la
 * migración debe superar `validate:rls`.
 * tests/coach-assignment-contract.test.ts comprueba que el candidato, este
 * archivo y la detección de almacenamiento describen las mismas tablas y columnas.
 *
 * Borrados: la ficha de equipo y la clase o sesión borran en cascada; el
 * miembro que asignó o sustituyó pasa a null. El candidato usa
 * `on delete set null (<columna>)` (PostgreSQL 15+) para no anular
 * organization_id; Drizzle no expresa esa lista de columnas, así que aquí
 * figura como "set null" y el contrato comprueba el texto exacto del candidato.
 */

export const classTemplateStaff = zaltyko.table(
  "class_template_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    classTemplateId: uuid("class_template_id").notNull(),
    staffProfileId: uuid("staff_profile_id").notNull(),
    // Null si se borra el miembro que asignó (SET NULL de una sola columna).
    assignedByMemberId: uuid("assigned_by_member_id"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("class_template_staff_uq").on(table.organizationId, table.classTemplateId, table.staffProfileId),
    index("class_template_staff_profile_idx").on(table.organizationId, table.staffProfileId),
    foreignKey({
      name: "class_template_staff_template_fk",
      columns: [table.organizationId, table.classTemplateId],
      foreignColumns: [classTemplates.organizationId, classTemplates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "class_template_staff_profile_fk",
      columns: [table.organizationId, table.staffProfileId],
      foreignColumns: [staffProfiles.organizationId, staffProfiles.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "class_template_staff_member_fk",
      columns: [table.organizationId, table.assignedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }).onDelete("set null"),
  ]
);

/** Las expresiones CHECK se escriben con el mismo texto que el candidato. */
export const SESSION_STAFF_OVERRIDE_REASON_CHECK =
  "reason is null or reason in ('absence', 'reinforcement', 'one_off_change', 'other')";

export const sessionStaffOverrides = zaltyko.table(
  "session_staff_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull(),
    reason: text("reason"),
    // Null si se borra el miembro que hizo el cambio.
    changedByMemberId: uuid("changed_by_member_id"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("session_staff_overrides_session_uq").on(table.organizationId, table.sessionId),
    check("session_staff_overrides_reason_check", sql.raw(SESSION_STAFF_OVERRIDE_REASON_CHECK)),
    foreignKey({
      name: "session_staff_overrides_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "session_staff_overrides_member_fk",
      columns: [table.organizationId, table.changedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }).onDelete("set null"),
  ]
);
