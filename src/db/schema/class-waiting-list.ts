// Class waiting list schema
import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const classWaitingList = pgTable(
  "class_waiting_list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id").notNull(),
    athleteId: uuid("athlete_id").notNull(),
    position: uuid("position").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
    notes: varchar("notes", { length: 500 }),
  },
  (table) => ({
    classIdx: index("class_waiting_list_class_idx").on(table.classId),
    athleteIdx: index("class_waiting_list_athlete_idx").on(table.athleteId),
  })
);
