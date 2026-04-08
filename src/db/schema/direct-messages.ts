import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { profiles } from "./profiles";

/**
 * Direct messages conversations
 * A conversation can be between 2 people (P2P) or include an academy context
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    // Optional academy context - if set, this conversation is related to that academy
    academyId: uuid("academy_id").references(() => academies.id, {
      onDelete: "cascade",
    }),
    // Title for group conversations (auto-generated for P2P)
    title: text("title"),
    // Last message preview for listing
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    // Metadata for filtering/grouping
    metadata: jsonb("metadata").$type<{
      type?: "p2p" | "group" | "academy_broadcast";
      context?: "general" | "class" | "event" | "attendance" | "billing";
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("conversations_tenant_idx").on(table.tenantId),
    academyIdx: index("conversations_academy_idx").on(table.academyId),
    lastMessageAtIdx: index("conversations_last_message_at_idx").on(table.lastMessageAt),
  })
);

/**
 * Participants in a conversation
 * Each user in a conversation has one record here
 */
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Role within the conversation
    role: text("role").notNull().default("member"), // "member" | "admin" | "owner"
    // Last read tracking for unread counts
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    // Notification preferences for this conversation
    notificationsEnabled: text("notifications_enabled").notNull().default("true"),
    // Hidden/archived conversations
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    // Muted until (temporary mute)
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationUserUnique: index("conversation_participants_conversation_user_unique")
      .on(table.conversationId, table.userId),
    userIdx: index("conversation_participants_user_idx").on(table.userId),
    hiddenIdx: index("conversation_participants_hidden_idx").on(table.hiddenAt),
  })
);

/**
 * Individual messages in a conversation
 */
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Message content
    content: text("content").notNull(),
    // Optional attachment
    attachmentUrl: text("attachment_url"),
    attachmentType: text("attachment_type"), // "image" | "file" | "video"
    attachmentName: text("attachment_name"),
    // Reply to another message (threading)
    replyToId: uuid("reply_to_id"),
    // Edit tracking
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // Soft delete (for "unsend" feature)
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdx: index("conversation_messages_conversation_idx").on(table.conversationId),
    senderIdx: index("conversation_messages_sender_idx").on(table.senderId),
    createdAtIdx: index("conversation_messages_created_at_idx").on(table.createdAt),
    // Index for pagination - get messages in order
    conversationCreatedIdx: index("conversation_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
  })
);

/**
 * Read receipts for messages
 * Tracks who has read which messages
 */
export const messageReadReceipts = pgTable(
  "message_read_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    messageUserUnique: index("message_read_receipts_message_user_unique")
      .on(table.messageId, table.userId),
    userIdx: index("message_read_receipts_user_idx").on(table.userId),
  })
);
