import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  pgEnum,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { profiles } from "./profiles";

/**
 * Custom roles for academies (extends the basic membership roles)
 */
export const roleMembers = pgTable(
  "role_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id").notNull(),
    userId: uuid("user_id").notNull(),
    academyId: uuid("academy_id").notNull(),
    memberRole: text("member_role").notNull().default("viewer"),
    permissions: jsonb("permissions"), // Custom permissions override
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    customPermissions: jsonb("custom_permissions"),
    assignedBy: uuid("assigned_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    roleIdx: index("role_members_role_idx").on(table.roleId),
    userIdx: index("role_members_user_idx").on(table.userId),
    academyIdx: index("role_members_academy_idx").on(table.academyId),
    uq: uniqueIndex("role_members_uq").on(table.roleId, table.userId),
  })
);

/**
 * Academy custom roles (extends the base membership role)
 */
export const academyRoles = pgTable(
  "academy_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    permissions: jsonb("permissions").notNull().default([]),
    isDefault: text("is_default").notNull().default("false"),
    type: text("type").notNull().default("custom"),
    inheritsFrom: uuid("inherits_from"),
    isActive: text("is_active").notNull().default("true"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    createdBy: uuid("created_by"),
  },
  (table) => ({
    academyIdx: index("academy_roles_academy_idx").on(table.academyId),
  })
);
