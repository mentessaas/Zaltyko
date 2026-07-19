import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

export const eventLogs = pgTable(
  "event_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    academyIdx: index("event_logs_academy_idx").on(table.academyId),
    eventTypeIdx: index("event_logs_event_type_idx").on(table.eventType),
    createdAtIdx: index("event_logs_created_at_idx").on(table.createdAt),
  })
);

