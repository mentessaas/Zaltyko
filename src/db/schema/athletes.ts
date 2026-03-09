import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { groups } from "./groups";
import { profiles } from "./profiles";

export const athletes = pgTable(
  "athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => profiles.userId, { onDelete: "set null" }),
    name: text("name").notNull(),
    dob: date("dob"),
    level: text("level"),
    status: text("status").notNull().default("active"),
    /**
     * @deprecated Usar groupAthletes en lugar de este campo para la pertenencia a grupos
     */
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    tenantAcademyIdx: index("athletes_tenant_academy_idx").on(table.tenantId, table.academyId),
    userIdIdx: index("athletes_user_id_idx").on(table.userId),
    deletedAtIdx: index("athletes_deleted_at_idx").on(table.deletedAt),
  })
);

