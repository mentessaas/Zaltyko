import { boolean, index, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

import { profiles } from "./profiles";
import { plans } from "./plans";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    status: text("status"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdIdx: index("subscriptions_user_id_idx").on(table.userId),
    planIdx: index("subscriptions_plan_id_idx").on(table.planId),
    userUnique: uniqueIndex("subscriptions_user_id_unique").on(table.userId),
  })
);

