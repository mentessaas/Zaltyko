import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { leads } from "./leads";
import { profiles } from "./profiles";

/** A prospect's class trial; deliberately separate from academy subscription trials. */
export const leadTrials = pgTable(
  "lead_trials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    status: text("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    attendedAt: timestamp("attended_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    academyStatusIdx: index("lead_trials_academy_status_idx").on(table.academyId, table.status),
    tenantLeadIdx: index("lead_trials_tenant_lead_idx").on(table.tenantId, table.leadId),
    idempotencyIdx: uniqueIndex("lead_trials_idempotency_idx").on(table.tenantId, table.idempotencyKey),
  }),
);

export type LeadTrial = typeof leadTrials.$inferSelect;
export type NewLeadTrial = typeof leadTrials.$inferInsert;
