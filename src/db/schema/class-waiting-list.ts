// Class waiting list schema
import { index, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { classes } from "./classes";

export const classWaitingList = pgTable(
  "class_waiting_list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull(),
    position: integer("position").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
    notes: varchar("notes", { length: 500 }),
  },
  (table) => ({
    tenantIdx: index("class_waiting_list_tenant_idx").on(table.tenantId),
    tenantAcademyIdx: index("class_waiting_list_tenant_academy_idx").on(table.tenantId, table.academyId),
    classIdx: index("class_waiting_list_class_idx").on(table.classId),
    athleteIdx: index("class_waiting_list_athlete_idx").on(table.athleteId),
  })
);
