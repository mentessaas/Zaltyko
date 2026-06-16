import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { profileRoleEnum } from "./enums";
import { profiles } from "./profiles";

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    email: text("email").notNull(),
    role: profileRoleEnum("role").notNull(),
    roleId: uuid("role_id"), // Rol personalizado de academy_roles
    token: text("token").notNull(),
    status: text("status").notNull().default("pending"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    academyIds: uuid("academy_ids").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    supabaseUserId: uuid("supabase_user_id"),
    defaultAcademyId: uuid("default_academy_id").references(() => academies.id, {
      onDelete: "set null",
    }),
    // Nuevos campos para invitación mejorada
    customMessage: text("custom_message"),
    permissions: text("permissions").array(), // Permisos específicos si no se usa rol
    sendEmail: text("send_email").notNull().default("true"),
    resendCount: text("resend_count").notNull().default("0"),
    lastResentAt: timestamp("last_resent_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index("invitations_tenant_idx").on(table.tenantId),
    statusIdx: index("invitations_status_idx").on(table.status),
    tokenUnique: uniqueIndex("invitations_token_unique").on(table.token),
    emailTenantUnique: uniqueIndex("invitations_email_tenant_unique").on(table.tenantId, table.email),
    roleIdx: index("invitations_role_idx").on(table.roleId),
  })
);