import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { leads } from "./leads";

/** Immutable inbound touchpoints; the lead row remains the deduplicated identity. */
export const leadInteractions = pgTable(
  "lead_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    academy: text("academy"),
    reason: text("reason").notNull(),
    plan: text("plan"),
    source: text("source").notNull(),
    message: text("message").notNull(),
    visitorId: uuid("visitor_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    leadIdx: index("lead_interactions_lead_idx").on(table.leadId, table.createdAt),
    submissionIdx: uniqueIndex("lead_interactions_submission_idx").on(table.submissionId),
  }),
);
