import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { date } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { discounts } from "./discounts";
import { profiles } from "./profiles";

export const discountCampaigns = pgTable(
  "discount_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    discountId: uuid("discount_id")
      .notNull()
      .references(() => discounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    maxUses: integer("max_uses"),
    currentUses: integer("current_uses").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantAcademyIdx: index("discount_campaigns_tenant_academy_idx").on(table.tenantId, table.academyId),
    discountIdx: index("discount_campaigns_discount_idx").on(table.discountId),
    activeDatesIdx: index("discount_campaigns_active_dates_idx").on(table.isActive, table.startDate, table.endDate),
  })
);
