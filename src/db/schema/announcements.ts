import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { profiles } from "./profiles";

/**
 * Academy announcements - for broadcasting messages to all academy members
 */
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    // Who created the announcement
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Content
    title: text("title").notNull(),
    content: text("content").notNull(),
    // Optional link/action
    actionUrl: text("action_url"),
    actionLabel: text("action_label"),
    // Priority level
    priority: text("priority").notNull().default("normal"), // "low" | "normal" | "high" | "urgent"
    // Category for filtering
    category: text("category").notNull().default("general"), // "general" | "event" | "billing" | "class" | "news"
    // Metadata
    metadata: jsonb("metadata").$type<{
      targetRoles?: string[]; // Only send to specific roles like ["parent", "athlete"]
      classId?: string; // If related to a specific class
      eventId?: string; // If related to a specific event
    }>(),
    // Stats
    sentCount: text("sent_count").notNull().default("0"),
    readCount: text("read_count").notNull().default("0"),
    // Active/draft status
    status: text("status").notNull().default("published"), // "draft" | "published" | "archived"
    // Timestamps
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    academyIdx: index("announcements_academy_idx").on(table.academyId),
    authorIdx: index("announcements_author_idx").on(table.authorId),
    statusIdx: index("announcements_status_idx").on(table.status),
    priorityIdx: index("announcements_priority_idx").on(table.priority),
    publishedAtIdx: index("announcements_published_at_idx").on(table.publishedAt),
    // Index for listing announcements by academy
    academyStatusPublishedIdx: index("announcements_academy_status_published_idx").on(
      table.academyId,
      table.status,
      table.publishedAt
    ),
  })
);

/**
 * Track which users have read which announcements
 */
export const announcementReadStatus = pgTable(
  "announcement_read_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // One read status per user per announcement
    announcementUserUnique: index("announcement_read_status_unique").on(
      table.announcementId,
      table.userId
    ),
    userIdx: index("announcement_read_status_user_idx").on(table.userId),
    announcementIdx: index("announcement_read_status_announcement_idx").on(table.announcementId),
  })
);
