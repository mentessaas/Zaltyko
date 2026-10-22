import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academySportConfigs } from "./sport-config";
import { athletes } from "./athletes";

export const athleteSportConfigs = pgTable(
  "athlete_sport_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    academySportConfigId: uuid("academy_sport_config_id")
      .notNull()
      .references(() => academySportConfigs.id, { onDelete: "cascade" }),
    programCode: text("program_code"),
    levelCode: text("level_code"),
    categoryCode: text("category_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    athleteConfigUnique: uniqueIndex("athlete_sport_configs_athlete_config_unique").on(
      table.athleteId,
      table.academySportConfigId
    ),
    tenantIdx: index("athlete_sport_configs_tenant_idx").on(table.tenantId),
    configIdx: index("athlete_sport_configs_config_idx").on(table.academySportConfigId),
  })
);
