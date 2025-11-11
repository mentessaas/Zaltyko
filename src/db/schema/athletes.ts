import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { groups } from "./groups";

export const athletes = pgTable(
  "athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dob: date("dob"),
    level: text("level"),
    status: text("status").notNull().default("active"),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantAcademyIdx: index("athletes_tenant_academy_idx").on(table.tenantId, table.academyId),
  })
);

