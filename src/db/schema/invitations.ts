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
  },
  (table) => ({
    tenantIdx: index("invitations_tenant_idx").on(table.tenantId),
    statusIdx: index("invitations_status_idx").on(table.status),
    tokenUnique: uniqueIndex("invitations_token_unique").on(table.token),
    emailTenantUnique: uniqueIndex("invitations_email_tenant_unique").on(table.tenantId, table.email),
  })
);


