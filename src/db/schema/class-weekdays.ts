import { index, integer, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { classes } from "./classes";

export const classWeekdays = pgTable(
  "class_weekdays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    weekday: integer("weekday").notNull(),
  },
  (table) => ({
    classWeekdayIdx: uniqueIndex("class_weekdays_class_weekday_idx").on(table.classId, table.weekday),
    tenantIdx: index("class_weekdays_tenant_idx").on(table.tenantId),
  })
);


