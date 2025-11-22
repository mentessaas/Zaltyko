import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { onboardingChecklistStatusEnum } from "./enums";
import { academies } from "./academies";

export const onboardingChecklistItems = pgTable(
  "onboarding_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    status: onboardingChecklistStatusEnum("status").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    academyKeyUnique: uniqueIndex("onboarding_checklist_academy_key_unique").on(table.academyId, table.key),
    tenantIdx: index("onboarding_checklist_tenant_idx").on(table.tenantId),
    statusIdx: index("onboarding_checklist_status_idx").on(table.status),
  })
);


