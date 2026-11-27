import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  athleteLimit: integer("athlete_limit"),
  groupLimit: integer("group_limit"),
  classLimit: integer("class_limit"),
  /** Total team members, including the academy owner. */
  teamMemberLimit: integer("team_member_limit"),
  academyLimit: integer("academy_limit"),
  includedLocations: integer("included_locations").notNull().default(1),
  extraLocationMonthPriceCents: integer("extra_location_month_price_cents"),
  extraLocationYearPriceCents: integer("extra_location_year_price_cents"),
  stripePriceId: text("stripe_price_id"),
  stripeAnnualPriceId: text("stripe_annual_price_id"),
  stripeProductId: text("stripe_product_id"),
  currency: text("currency").notNull().default("eur"),
  billingInterval: text("billing_interval"),
  nickname: text("nickname"),
  isArchived: boolean("is_archived").notNull().default(false),
  priceEur: integer("price_eur").notNull(),
  annualPriceEur: integer("annual_price_eur"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
