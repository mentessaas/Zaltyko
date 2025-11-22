import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { profiles } from "./profiles";

export type OnboardingStepFlags = {
  [key: string]: boolean | undefined;
};

export const onboardingStates = pgTable(
  "onboarding_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    ownerProfileId: uuid("owner_profile_id").references(() => profiles.id, { onDelete: "set null" }),
    currentStep: integer("current_step").notNull().default(1),
    completedWizard: boolean("completed_wizard").notNull().default(false),
    steps: jsonb("steps").$type<OnboardingStepFlags>(),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    lastReminderSentAt: timestamp("last_reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    notes: text("notes"),
  },
  (table) => ({
    academyUnique: uniqueIndex("onboarding_states_academy_unique").on(table.academyId),
    tenantIdx: index("onboarding_states_tenant_idx").on(table.tenantId),
  })
);


