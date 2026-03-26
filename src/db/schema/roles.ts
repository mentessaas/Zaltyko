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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    academyIdx: index("academy_roles_academy_idx").on(table.academyId),
  })
);
