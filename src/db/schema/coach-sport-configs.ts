import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { coaches } from "./coaches";
import { academySportConfigs } from "./sport-config";

export const coachSportConfigs = pgTable(
  "coach_sport_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => coaches.id, { onDelete: "cascade" }),
    academySportConfigId: uuid("academy_sport_config_id")
      .notNull()
      .references(() => academySportConfigs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueAssignment: uniqueIndex("coach_sport_configs_unique").on(
      table.tenantId,
      table.coachId,
      table.academySportConfigId
    ),
    coachIdx: index("coach_sport_configs_coach_idx").on(table.coachId),
    configIdx: index("coach_sport_configs_config_idx").on(table.academySportConfigId),
    tenantIdx: index("coach_sport_configs_tenant_idx").on(table.tenantId),
  })
);

