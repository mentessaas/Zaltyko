// Push tokens schema
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { profiles } from "./profiles";

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform").notNull().default("web"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index("push_tokens_user_idx").on(table.userId),
    userTokenUnique: uniqueIndex("push_tokens_user_token_unique").on(
      table.userId,
      table.token
    ),
  })
);
