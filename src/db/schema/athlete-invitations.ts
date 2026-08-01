import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { athletes } from "./athletes";
import { profiles } from "./profiles";

/**
 * ZAL-138 [D-006 v0] — Magic links Supabase para primeras atletas.
 *
 * Tabla operativa de invitaciones. NO es fuente del KPI TTFAA: la fuente
 * canónica es `athletes.magic_link_opened_at` + `athletes.profile_completed_at`
 * (definición D-006 gate 1). Esta tabla guarda el ciclo de vida del invite
 * (enviado / abierto / perfil completo / revocado / expirado) y el token
 * generado por Supabase para auditoría.
 *
 * Estados:
 *   pending   - creado, aún no se llamó a Supabase
 *   sent      - Supabase devolvió magic link y/o se envió email
 *   opened    - el destinatario abrió el magic link (sign in)
 *   completed - atleta confirmó perfil (D-006 gate 1 cumplido)
 *   expired   - pasó expires_at sin apertura
 *   revoked   - el owner lo canceló manualmente
 *
 * El índice único parcial `athlete_invitations_active_unique` permite
 * reintento seguro (mismo email + academia → upsert) sin duplicar filas.
 */
export const athleteInvitations = pgTable(
  "athlete_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    status: text("status").notNull().default("pending"),
    template: text("template").notNull().default("first_athlete_v1"),
    customMessage: text("custom_message"),
    magicLinkToken: text("magic_link_token").notNull(),
    magicLinkSentAt: timestamp("magic_link_sent_at", { withTimezone: true }),
    magicLinkOpenedAt: timestamp("magic_link_opened_at", { withTimezone: true }),
    profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
    athleteId: uuid("athlete_id").references(() => athletes.id, {
      onDelete: "set null",
    }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    activeUnique: uniqueIndex("athlete_invitations_active_unique").on(
      table.academyId,
      table.emailNormalized
    ),
    tokenIdx: index("athlete_invitations_token_idx").on(table.magicLinkToken),
    tenantAcademyIdx: index("athlete_invitations_tenant_academy_idx").on(
      table.tenantId,
      table.academyId
    ),
    statusIdx: index("athlete_invitations_status_idx").on(table.status),
  })
);

export type AthleteInvitationRow = typeof athleteInvitations.$inferSelect;
export type NewAthleteInvitationRow = typeof athleteInvitations.$inferInsert;
