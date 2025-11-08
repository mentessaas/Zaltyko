import { index, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { plans } from "./plans";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    status: text("status"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    academyIdx: index("subscriptions_academy_id_idx").on(table.academyId),
    planIdx: index("subscriptions_plan_id_idx").on(table.planId),
    academyUnique: uniqueIndex("subscriptions_academy_id_unique").on(table.academyId),
  })
);

