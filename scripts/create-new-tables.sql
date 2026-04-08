-- New messaging and announcements tables for Zaltyko
-- Created: 2026-04-09

-- Conversations table
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid,
	"title" text,
	"last_message_preview" text,
	"last_message_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for conversations
CREATE INDEX IF NOT EXISTS "conversations_tenant_idx" ON "conversations"("tenant_id");
CREATE INDEX IF NOT EXISTS "conversations_academy_idx" ON "conversations"("academy_id");
CREATE INDEX IF NOT EXISTS "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- Conversation participants table
CREATE TABLE IF NOT EXISTS "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"last_read_at" timestamp with time zone,
	"notifications_enabled" text DEFAULT 'true' NOT NULL,
	"hidden_at" timestamp with time zone,
	"muted_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for conversation participants
CREATE INDEX IF NOT EXISTS "conversation_participants_conversation_user_unique" ON "conversation_participants"("conversation_id", "user_id");
CREATE INDEX IF NOT EXISTS "conversation_participants_user_idx" ON "conversation_participants"("user_id");
CREATE INDEX IF NOT EXISTS "conversation_participants_hidden_idx" ON "conversation_participants"("hidden_at");

-- Conversation messages table
CREATE TABLE IF NOT EXISTS "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"attachment_url" text,
	"attachment_type" text,
	"attachment_name" text,
	"reply_to_id" uuid,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for conversation messages
CREATE INDEX IF NOT EXISTS "conversation_messages_conversation_idx" ON "conversation_messages"("conversation_id");
CREATE INDEX IF NOT EXISTS "conversation_messages_sender_idx" ON "conversation_messages"("sender_id");
CREATE INDEX IF NOT EXISTS "conversation_messages_created_at_idx" ON "conversation_messages"("created_at");
CREATE INDEX IF NOT EXISTS "conversation_messages_conversation_created_idx" ON "conversation_messages"("conversation_id", "created_at");

-- Message read receipts table
CREATE TABLE IF NOT EXISTS "message_read_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for message read receipts
CREATE INDEX IF NOT EXISTS "message_read_receipts_message_user_unique" ON "message_read_receipts"("message_id", "user_id");
CREATE INDEX IF NOT EXISTS "message_read_receipts_user_idx" ON "message_read_receipts"("user_id");

-- Announcements table
CREATE TABLE IF NOT EXISTS "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"action_url" text,
	"action_label" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"metadata" jsonb,
	"sent_count" text DEFAULT '0' NOT NULL,
	"read_count" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for announcements
CREATE INDEX IF NOT EXISTS "announcements_academy_idx" ON "announcements"("academy_id");
CREATE INDEX IF NOT EXISTS "announcements_author_idx" ON "announcements"("author_id");
CREATE INDEX IF NOT EXISTS "announcements_status_idx" ON "announcements"("status");
CREATE INDEX IF NOT EXISTS "announcements_priority_idx" ON "announcements"("priority");
CREATE INDEX IF NOT EXISTS "announcements_published_at_idx" ON "announcements"("published_at");
CREATE INDEX IF NOT EXISTS "announcements_academy_status_published_idx" ON "announcements"("academy_id", "status", "published_at");

-- Announcement read status table
CREATE TABLE IF NOT EXISTS "announcement_read_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for announcement read status
CREATE INDEX IF NOT EXISTS "announcement_read_status_unique" ON "announcement_read_status"("announcement_id", "user_id");
CREATE INDEX IF NOT EXISTS "announcement_read_status_user_idx" ON "announcement_read_status"("user_id");
CREATE INDEX IF NOT EXISTS "announcement_read_status_announcement_idx" ON "announcement_read_status"("announcement_id");
