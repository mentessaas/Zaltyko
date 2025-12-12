import { boolean, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { date } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { athletes } from "./athletes";
import { profiles } from "./profiles";

export const scholarships = pgTable(
  "scholarships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    discountType: text("discount_type").notNull().default("percentage"),
    discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantAcademyIdx: index("scholarships_tenant_academy_idx").on(table.tenantId, table.academyId),
    athleteIdx: index("scholarships_athlete_idx").on(table.athleteId),
    activeIdx: index("scholarships_active_idx").on(table.isActive, table.startDate, table.endDate),
    datesIdx: index("scholarships_dates_idx").on(table.startDate, table.endDate),
  })
);

