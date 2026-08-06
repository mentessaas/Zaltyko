// Communication schema
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { academySportConfigs } from "./sport-config";
import { academies } from "./academies";

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "cascade" }),
    sportConfigId: uuid("sport_config_id").references(() => academySportConfigs.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    channel: varchar("channel", { length: 50 }).notNull().default("whatsapp"),
    templateType: varchar("template_type", { length: 100 }).notNull(),
    subject: varchar("subject", { length: 200 }),
    body: text("body").notNull(),
    variables: jsonb("variables").$type<string[]>(),
    isSystem: boolean("is_system").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    usageCount: integer("usage_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index("message_templates_tenant_idx").on(table.tenantId),
    academyIdx: index("message_templates_academy_idx").on(table.academyId),
    sportConfigIdx: index("message_templates_sport_config_idx").on(table.sportConfigId),
  })
);

export const messageGroups = pgTable(
  "message_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    recipientCount: integer("recipient_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("message_groups_tenant_idx").on(table.tenantId),
    academyIdx: index("message_groups_academy_idx").on(table.academyId),
  })
);

export const scheduledNotifications = pgTable(
  "scheduled_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "cascade" }),
    groupId: uuid("group_id"),
    templateId: uuid("template_id"),
    channel: varchar("channel", { length: 50 }).notNull().default("whatsapp"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("scheduled_notifications_tenant_idx").on(table.tenantId),
    academyIdx: index("scheduled_notifications_academy_idx").on(table.academyId),
    statusIdx: index("scheduled_notifications_status_idx").on(table.status),
  })
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull(),
    channel: varchar("channel", { length: 50 }).notNull().default("whatsapp"),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    profileIdx: index("notification_preferences_profile_idx").on(table.profileId),
  })
);
