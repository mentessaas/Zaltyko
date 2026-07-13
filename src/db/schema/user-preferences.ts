import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { profiles } from "./profiles";

export type TooltipFlagMap = Record<string, boolean>;

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id"),
    tooltipFlags: jsonb("tooltip_flags").$type<TooltipFlagMap>(),
    firstTimeFlags: jsonb("first_time_flags").$type<Record<string, boolean>>(),
    timezone: text("timezone").default("Europe/Madrid"),
    language: text("language").default("es"),
    emailNotifications: jsonb("email_notifications")
      .$type<Record<string, boolean>>()
      .default({}),
    inAppNotifications: jsonb("in_app_notifications")
      .$type<{
        enabled: boolean;
        types: Record<string, boolean>;
      }>()
      .default({ enabled: true, types: {} }),
    classReminders: jsonb("class_reminders")
      .$type<{
        enabled: boolean;
        "24h_before": boolean;
        "1h_before": boolean;
      }>()
      .default({ enabled: true, "24h_before": true, "1h_before": false }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("user_preferences_user_id_unique").on(table.userId),
  })
);
