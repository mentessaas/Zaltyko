import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { classes } from "./classes";
import { coaches } from "./coaches";

export const classCoachAssignments = pgTable(
  "class_coach_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => coaches.id, { onDelete: "cascade" }),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueAssignment: uniqueIndex("class_coach_assignments_unique").on(
      table.tenantId,
      table.classId,
      table.coachId
    ),
    classIdx: index("class_coach_assignments_class_idx").on(table.classId),
    coachIdx: index("class_coach_assignments_coach_idx").on(table.coachId),
  })
);


