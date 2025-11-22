import { boolean, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { date } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { profiles } from "./profiles";

export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    code: text("code"),
    name: text("name").notNull(),
    description: text("description"),
    discountType: text("discount_type").notNull().default("percentage"),
    discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
    applicableTo: text("applicable_to").notNull().default("all"),
    minAmount: numeric("min_amount", { precision: 10, scale: 2 }),
    maxDiscount: numeric("max_discount", { precision: 10, scale: 2 }),
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
    tenantAcademyIdx: index("discounts_tenant_academy_idx").on(table.tenantId, table.academyId),
    codeIdx: index("discounts_code_idx").on(table.code),
    activeDatesIdx: index("discounts_active_dates_idx").on(table.isActive, table.startDate, table.endDate),
    codeUnique: index("discounts_code_unique").on(table.academyId, table.code),
  })
);

