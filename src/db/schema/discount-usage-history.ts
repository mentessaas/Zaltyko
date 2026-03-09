import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { date } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { discounts } from "./discounts";
import { athletes } from "./athletes";
import { charges } from "./charges";

export const discountUsageHistory = pgTable(
  "discount_usage_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    discountId: uuid("discount_id")
      .notNull()
      .references(() => discounts.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .references(() => athletes.id, { onDelete: "set null" }),
    chargeId: uuid("charge_id")
      .references(() => charges.id, { onDelete: "set null" }),
    code: text("code"),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull(),
    originalAmount: numeric("original_amount", { precision: 10, scale: 2 }).notNull(),
    finalAmount: numeric("final_amount", { precision: 10, scale: 2 }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantAcademyIdx: index("discount_usage_history_tenant_academy_idx").on(table.tenantId, table.academyId),
    discountIdx: index("discount_usage_history_discount_idx").on(table.discountId),
    athleteIdx: index("discount_usage_history_athlete_idx").on(table.athleteId),
    chargeIdx: index("discount_usage_history_charge_idx").on(table.chargeId),
    usedAtIdx: index("discount_usage_history_used_at_idx").on(table.usedAt),
  })
);
