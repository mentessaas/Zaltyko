import { index, pgTable, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

import { membershipRoleEnum } from "./enums";
import { academies } from "./academies";
import { profiles } from "./profiles";

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("coach"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    academyIdx: index("memberships_academy_id_idx").on(table.academyId),
    uq: uniqueIndex("memberships_user_academy_uq").on(table.userId, table.academyId),
  })
);

