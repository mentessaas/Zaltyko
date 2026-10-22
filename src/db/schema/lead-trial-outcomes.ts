import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { leadTrials } from "./lead-trials";
import { profiles } from "./profiles";

/** Immutable outcome history for a prospect trial. */
export const leadTrialOutcomes = pgTable(
  "lead_trial_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    leadTrialId: uuid("lead_trial_id")
      .notNull()
      .references(() => leadTrials.id, { onDelete: "cascade" }),
    outcome: text("outcome").notNull(),
    notes: text("notes"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    recordedBy: uuid("recorded_by").references(() => profiles.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    trialIdx: index("lead_trial_outcomes_trial_idx").on(table.tenantId, table.leadTrialId, table.createdAt),
    idempotencyIdx: uniqueIndex("lead_trial_outcomes_idempotency_idx").on(table.tenantId, table.idempotencyKey),
  }),
);

export type LeadTrialOutcome = typeof leadTrialOutcomes.$inferSelect;
export type NewLeadTrialOutcome = typeof leadTrialOutcomes.$inferInsert;
