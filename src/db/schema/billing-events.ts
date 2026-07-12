import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeEventId: text("stripe_event_id").notNull().unique(),
    type: text("type").notNull(),
    status: text("status").notNull().default("received"),
    attemptCount: integer("attempt_count").notNull().default(1),
    errorMessage: text("error_message"),
    stripeCreatedAt: timestamp("stripe_created_at", { withTimezone: true }),
    stripeObjectId: text("stripe_object_id"),
    livemode: boolean("livemode").notNull().default(false),
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    typeCreatedIdx: index("billing_events_type_created_idx").on(table.type, table.createdAt),
    objectTypeIdx: index("billing_events_object_type_idx").on(table.stripeObjectId, table.type),
  })
);

