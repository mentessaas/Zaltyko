import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { athletes } from "./athletes";
import { classes } from "./classes";
import { coaches } from "./coaches";
import { groups } from "./groups";
import { profiles } from "./profiles";

export const coachCompensation = pgTable(
  "coach_compensation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => coaches.id, { onDelete: "cascade" }),
    hourlyRateCents: integer("hourly_rate_cents").default(0).notNull(),
    monthlySalaryCents: integer("monthly_salary_cents").default(0).notNull(),
    estimatedWeeklyHours: integer("estimated_weekly_hours")
      .default(0)
      .notNull(),
    /** @deprecated Conservado durante la transición a horas semanales. */
    estimatedWeeklyMinutes: integer("estimated_weekly_minutes"),
    notes: text("notes"),
    effectiveFrom: date("effective_from").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("coach_compensation_tenant_idx").on(table.tenantId),
    academyCoachIdx: index("coach_compensation_academy_coach_idx").on(
      table.academyId,
      table.coachId
    ),
  })
);

export const academyExpenses = pgTable(
  "academy_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    category: text("category").notNull().default("other"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    recurrence: text("recurrence").notNull().default("monthly"),
    appliesToType: text("applies_to_type").notNull().default("academy"),
    appliesToId: uuid("applies_to_id"),
    /** @deprecated Usar appliesToType y appliesToId. */
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "set null",
    }),
    /** @deprecated Usar appliesToType y appliesToId. */
    classId: uuid("class_id").references(() => classes.id, {
      onDelete: "set null",
    }),
    /** @deprecated Usar appliesToType y appliesToId. */
    coachId: uuid("coach_id").references(() => coaches.id, {
      onDelete: "set null",
    }),
    /** @deprecated Campo histórico de periodo contable. */
    period: text("period"),
    expenseDate: date("expense_date").notNull(),
    /** @deprecated Campo histórico de fin de vigencia. */
    effectiveTo: date("effective_to"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("academy_expenses_tenant_idx").on(table.tenantId),
    academyIdx: index("academy_expenses_academy_idx").on(table.academyId),
    appliesToIdx: index("academy_expenses_applies_to_idx").on(
      table.appliesToType,
      table.appliesToId
    ),
  })
);

export const churnReasons = pgTable(
  "churn_reasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    previousStatus: text("previous_status"),
    newStatus: text("new_status").notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    createdByProfileId: uuid("created_by_profile_id").references(
      () => profiles.id,
      {
        onDelete: "set null",
      }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("churn_reasons_tenant_idx").on(table.tenantId),
    academyAthleteIdx: index("churn_reasons_academy_athlete_idx").on(
      table.academyId,
      table.athleteId
    ),
  })
);

export const academyDiagnostics = pgTable(
  "academy_diagnostics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    answers: jsonb("answers")
      .$type<Record<string, boolean | number | string>>()
      .notNull(),
    score: integer("score").notNull(),
    level: text("level").notNull(),
    recommendedTasks: jsonb("recommended_tasks")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdByProfileId: uuid("created_by_profile_id").references(
      () => profiles.id,
      {
        onDelete: "set null",
      }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("academy_diagnostics_tenant_idx").on(table.tenantId),
    academyCreatedIdx: index("academy_diagnostics_academy_created_idx").on(
      table.academyId,
      table.createdAt
    ),
  })
);

export const leakActionHistory = pgTable(
  "leak_action_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    athleteId: uuid("athlete_id").references(() => athletes.id, {
      onDelete: "set null",
    }),
    classId: uuid("class_id").references(() => classes.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull().default("whatsapp"),
    message: text("message"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    createdByProfileId: uuid("created_by_profile_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("leak_action_history_tenant_idx").on(table.tenantId),
    academyCreatedIdx: index("leak_action_history_academy_created_idx").on(
      table.academyId,
      table.createdAt
    ),
    athleteIdx: index("leak_action_history_athlete_idx").on(table.athleteId),
    classIdx: index("leak_action_history_class_idx").on(table.classId),
  })
);
