import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { profiles } from "./profiles";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    read: boolean("read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUserIdx: index("notifications_tenant_user_idx").on(table.tenantId, table.userId),
    userReadIdx: index("notifications_user_read_idx").on(table.userId, table.read),
    createdAtIndex: index("notifications_created_at_idx").on(table.createdAt),
    typeIdx: index("notifications_type_idx").on(table.type),
  })
);

