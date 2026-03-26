// Communication schema
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    channel: varchar("channel", { length: 50 }).notNull().default("whatsapp"),
    templateType: varchar("template_type", { length: 100 }).notNull(),
    subject: varchar("subject", { length: 200 }),
    body: text("body").notNull(),
    variables: jsonb("variables").$type<string[]>(),
    isSystem: text("is_system").notNull().default("false"),
    isActive: text("is_active").notNull().default("true"),
    usageCount: uuid("usage_count").defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index("message_templates_tenant_idx").on(table.tenantId),
  })
);

export const messageGroups = pgTable(
  "message_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    recipientCount: uuid("recipient_count").defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("message_groups_tenant_idx").on(table.tenantId),
  })
);

export const scheduledNotifications = pgTable(
  "scheduled_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
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
    statusIdx: index("scheduled_notifications_status_idx").on(table.status),
  })
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull(),
    channel: varchar("channel", { length: 50 }).notNull().default("whatsapp"),
    enabled: text("enabled").notNull().default("true"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    profileIdx: index("notification_preferences_profile_idx").on(table.profileId),
  })
);
