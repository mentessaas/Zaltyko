import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  athleteLimit: integer("athlete_limit"),
  stripePriceId: text("stripe_price_id"),
  priceEur: integer("price_eur").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

