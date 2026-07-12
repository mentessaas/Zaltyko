import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { academies } from "./academies";
import { profiles } from "./profiles";

export const academyTrials = pgTable(
  "academy_trials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    grantedPlanCode: text("granted_plan_code").notNull().default("pro"),
    source: text("source").notNull().default("self_serve"),
    startedBy: uuid("started_by").references(() => profiles.userId, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    dayFiveNotifiedAt: timestamp("day_five_notified_at", { withTimezone: true }),
    expiryNotifiedAt: timestamp("expiry_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    academyStartedIdx: index("academy_trials_academy_started_idx").on(
      table.academyId,
      table.startedAt
    ),
    tenantStatusIdx: index("academy_trials_tenant_status_idx").on(table.tenantId, table.status),
    activeAcademyUnique: uniqueIndex("academy_trials_active_academy_unique").on(
      table.academyId,
      table.status
    ).where(sql`${table.status} = 'active'`),
  })
);

export type AcademyTrial = typeof academyTrials.$inferSelect;
