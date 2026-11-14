import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { guardians, organizationMembers, organizations, zaltyko } from "@/db/schema/zaltyko-core";
import { charges } from "@/db/schema/zaltyko-ledger";

/**
 * Recordatorios de impago de cuotas de familias.
 *
 * Espejo del candidato SQL
 * docs/deployment/candidates/20261114120000_payment_reminders_candidate.sql,
 * que requiere autorización de Elvis y no está aplicado en ningún entorno.
 *
 * Igual que los precedentes de coach-assignment y session-plans, NO se exporta
 * desde `src/db/schema/index.ts` ni desde `src/db/zaltyko-schema.ts`, y
 * `drizzle.config.ts` no lo lee: un `db:generate`/`push` crearía estas tablas
 * sin RLS ni REVOKE. Vive fuera de `src/db/schema/` porque `pnpm validate:rls`
 * solo valida el historial aplicado (`supabase/migrations`).
 * tests/payment-reminders-contract.test.ts comprueba que el candidato, este
 * archivo y la detección de almacenamiento describen las mismas tablas y columnas.
 *
 * Borrados: la cuota y la academia borran en cascada; el tutor pagador y el
 * miembro que lo pidió pasan a null. El candidato usa
 * `on delete set null (<columna>)` (PostgreSQL 15+) para no anular
 * organization_id; Drizzle no expresa esa lista de columnas, así que aquí
 * figura como "set null" y el contrato comprueba el texto exacto del candidato.
 */

export const PAYMENT_REMINDER_SETTINGS_REPLY_TO_CHECK =
  "reply_to_email is null or (char_length(reply_to_email) <= 254 and reply_to_email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')";

export const paymentReminderSettings = zaltyko.table(
  "payment_reminder_settings",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subjectTemplate: text("subject_template"),
    bodyTemplate: text("body_template"),
    paymentInstructions: text("payment_instructions"),
    replyToEmail: text("reply_to_email"),
    minIntervalDays: integer("min_interval_days").notNull().default(7),
    autoEnabled: boolean("is_auto_enabled").notNull().default(false),
    autoAfterDays: integer("auto_after_days").notNull().default(3),
    version: integer("version").notNull().default(1),
    updatedByMemberId: uuid("updated_by_member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("payment_reminder_settings_interval_check", sql`min_interval_days between 1 and 90`),
    check("payment_reminder_settings_auto_after_check", sql`auto_after_days between 1 and 60`),
    check(
      "payment_reminder_settings_subject_check",
      sql`subject_template is null or (btrim(subject_template) <> '' and char_length(subject_template) <= 150)`
    ),
    check(
      "payment_reminder_settings_body_check",
      sql`body_template is null or (btrim(body_template) <> '' and char_length(body_template) <= 4000)`
    ),
    check(
      "payment_reminder_settings_instructions_check",
      sql`payment_instructions is null or char_length(payment_instructions) <= 1000`
    ),
    check("payment_reminder_settings_reply_to_check", sql.raw(PAYMENT_REMINDER_SETTINGS_REPLY_TO_CHECK)),
    check("payment_reminder_settings_version_check", sql`version > 0`),
    foreignKey({
      name: "payment_reminder_settings_member_fk",
      columns: [table.organizationId, table.updatedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }).onDelete("set null"),
  ]
);

export const paymentReminders = zaltyko.table(
  "payment_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id").notNull(),
    // Tutor pagador al que se escribió. Null si se borra esa ficha.
    guardianId: uuid("guardian_id"),
    emailGroupId: uuid("email_group_id").notNull(),
    origin: text("origin").notNull(),
    status: text("status").notNull().default("pending"),
    outstandingCents: bigint("outstanding_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    // Null en los recordatorios automáticos o si se borra al miembro.
    requestedByMemberId: uuid("requested_by_member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    index("payment_reminders_charge_idx").on(table.organizationId, table.chargeId, table.createdAt.desc()),
    check("payment_reminders_origin_check", sql`origin in ('manual', 'automatic')`),
    check("payment_reminders_status_check", sql`status in ('pending', 'sent', 'failed')`),
    check("payment_reminders_outstanding_check", sql`outstanding_cents >= 0`),
    check("payment_reminders_sent_at_check", sql`(status = 'sent') = (sent_at is not null)`),
    foreignKey({
      name: "payment_reminders_charge_fk",
      columns: [table.organizationId, table.chargeId],
      foreignColumns: [charges.organizationId, charges.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "payment_reminders_guardian_fk",
      columns: [table.organizationId, table.guardianId],
      foreignColumns: [guardians.organizationId, guardians.id],
    }).onDelete("set null"),
    foreignKey({
      name: "payment_reminders_member_fk",
      columns: [table.organizationId, table.requestedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }).onDelete("set null"),
  ]
);

export type PaymentReminderSettingsRow = typeof paymentReminderSettings.$inferSelect;
export type PaymentReminderRow = typeof paymentReminders.$inferSelect;
