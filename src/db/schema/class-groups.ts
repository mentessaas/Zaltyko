import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { classes } from "./classes";
import { groups } from "./groups";

export const classGroups = pgTable(
  "class_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueAssignment: uniqueIndex("class_groups_unique").on(
      table.tenantId,
      table.classId,
      table.groupId
    ),
    classIdx: index("class_groups_class_idx").on(table.classId),
    groupIdx: index("class_groups_group_idx").on(table.groupId),
  })
);

