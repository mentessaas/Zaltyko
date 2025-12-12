import { index, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

import { classSessions } from "./class-sessions";
import { athletes } from "./athletes";

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("present"),
    notes: text("notes"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("attendance_records_tenant_idx").on(table.tenantId),
    sessionIdx: index("attendance_records_session_idx").on(table.sessionId),
    sessionAthleteUq: uniqueIndex("attendance_records_session_athlete_uq").on(
      table.sessionId,
      table.athleteId
    ),
  })
);
