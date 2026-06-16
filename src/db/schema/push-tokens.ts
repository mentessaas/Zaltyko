// Push tokens schema
import { index, pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    token: text("token").notNull(),
    platform: text("platform").notNull().default("web"),
    isActive: text("is_active").notNull().default("true"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index("push_tokens_user_idx").on(table.userId),
  })
);
