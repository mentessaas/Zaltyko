import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  athleteLimit: integer("athlete_limit"),
  academyLimit: integer("academy_limit"),
  stripePriceId: text("stripe_price_id"),
  stripeProductId: text("stripe_product_id"),
  currency: text("currency").notNull().default("eur"),
  billingInterval: text("billing_interval"),
  nickname: text("nickname"),
  isArchived: boolean("is_archived").notNull().default(false),
  priceEur: integer("price_eur").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

