import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeEventId: text("stripe_event_id").notNull().unique(),
    type: text("type").notNull(),
    status: text("status").notNull().default("received"),
    errorMessage: text("error_message"),
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => ({
    typeCreatedIdx: index("billing_events_type_created_idx").on(table.type, table.createdAt),
  })
);


