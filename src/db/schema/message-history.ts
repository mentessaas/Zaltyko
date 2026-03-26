import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tabla para historial de mensajes (WhatsApp, SMS, email, etc.)
 */
export const messageHistory = pgTable(
  "message_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    profileId: uuid("profile_id"),
    phone: text("phone").notNull(),
    channel: text("channel").notNull().default("whatsapp"), // whatsapp, sms, email
    direction: text("direction").notNull().default("outbound"), // inbound, outbound
    status: text("status").notNull().default("pending"), // pending, sent, delivered, read, failed, cancelled
    message: text("message").notNull(),
    templateId: uuid("template_id"),
    meta: jsonb("meta"), // Additional data (external IDs, error messages, etc.)
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("message_history_tenant_idx").on(table.tenantId),
    profileIdx: index("message_history_profile_idx").on(table.profileId),
    statusIdx: index("message_history_status_idx").on(table.status),
    createdAtIdx: index("message_history_created_at_idx").on(table.createdAt),
  })
);

export type MessageHistory = typeof messageHistory.$inferSelect;
export type NewMessageHistory = typeof messageHistory.$inferInsert;
