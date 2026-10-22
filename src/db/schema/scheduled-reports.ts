// Scheduled reports schema
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const scheduledReports = pgTable(
  "scheduled_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    reportType: varchar("report_type", { length: 100 }).notNull(),
    schedule: varchar("schedule", { length: 100 }).notNull(),
    params: jsonb("params"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    isActive: text("is_active").notNull().default("true"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    academyIdx: index("scheduled_reports_academy_idx").on(table.academyId),
  })
);
