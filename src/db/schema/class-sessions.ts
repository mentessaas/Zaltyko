import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { classes } from "./classes";
import { coaches } from "./coaches";

export const classSessions = pgTable(
  "class_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id").references(() => coaches.id, { onDelete: "set null" }),
    sessionDate: date("session_date").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    status: text("status").notNull().default("scheduled"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("class_sessions_tenant_idx").on(table.tenantId),
    classDateIdx: index("class_sessions_class_date_idx").on(table.classId, table.sessionDate),
  })
);
