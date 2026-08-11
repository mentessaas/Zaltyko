import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { athletes } from "./athletes";
import { profiles } from "./profiles";

/**
 * ZAL-138 — Invitaciones "first athletes" vía Supabase magic links.
 *
 * Estado:
 *  - pending: creada, magic link enviado, sin abrir todavía.
 *  - opened: magic link consumido por verifyOtp (Supabase user_id linkeado).
 *  - profile_complete: el invitado completó su perfil de atleta (athletes row creada).
 *  - cancelled: cancelada por el owner antes de que se abra.
 *  - expired: pasó expires_at sin abrirse.
 *
 * Athlete "confirmado" requiere status = profile_complete. Sólo entonces se
 * contabiliza para first_parent_invited / first_athlete_invited / TTFAA.
 *
 * El unique index parcial sobre (academy_id, lower(email)) WHERE status IN
 * ('pending','opened') está definido en la migración SQL, no aquí (drizzle
 * pg-core no soporta `where` en uniqueIndex).
 */
export const athleteInvitations = pgTable(
  "athlete_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    email: text("email").notNull(),
    invitedBy: uuid("invited_by").references(() => profiles.userId, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    stateToken: text("state_token").notNull().unique(),
    customMessage: text("custom_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
    supabaseUserId: uuid("supabase_user_id"),
    athleteId: uuid("athlete_id").references(() => athletes.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resendCount: integer("resend_count").notNull().default(0),
    lastResentAt: timestamp("last_resent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    stateTokenUnique: uniqueIndex("athlete_invitations_state_token_unique").on(
      table.stateToken
    ),
    academyStatusIdx: index("athlete_invitations_academy_status_idx").on(
      table.academyId,
      table.status
    ),
    tenantIdx: index("athlete_invitations_tenant_idx").on(table.tenantId),
    supabaseUserIdx: index("athlete_invitations_supabase_user_idx").on(
      table.supabaseUserId
    ),
  })
);

export type AthleteInvitation = typeof athleteInvitations.$inferSelect;
export type NewAthleteInvitation = typeof athleteInvitations.$inferInsert;

export const ATHLETE_INVITATION_STATUSES = [
  "pending",
  "opened",
  "profile_complete",
  "cancelled",
  "expired",
] as const;

export type AthleteInvitationStatus = (typeof ATHLETE_INVITATION_STATUSES)[number];