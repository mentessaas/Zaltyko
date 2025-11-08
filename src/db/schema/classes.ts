import { index, integer, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    weekday: integer("weekday"),
    startTime: time("start_time"),
    endTime: time("end_time"),
    capacity: integer("capacity"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantAcademyIdx: index("classes_tenant_academy_idx").on(table.tenantId, table.academyId),
  })
);

