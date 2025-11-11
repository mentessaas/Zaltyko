import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { profileRoleEnum } from "./enums";

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique(),
    tenantId: uuid("tenant_id"),
    name: text("name"),
    role: profileRoleEnum("role").notNull().default("owner"),
    activeAcademyId: uuid("active_academy_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    isSuspended: boolean("is_suspended").notNull().default(false),
  },
  (table) => ({
    tenantRoleIdx: index("profiles_tenant_role_idx").on(table.tenantId, table.role),
    activeAcademyIdx: index("profiles_active_academy_idx").on(table.activeAcademyId),
  })
);

