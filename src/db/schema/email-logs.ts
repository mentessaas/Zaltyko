import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { profiles } from "./profiles";

export const emailLogs = pgTable(
  "email_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    template: text("template"),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    tenantIdx: index("email_logs_tenant_idx").on(table.tenantId),
    academyIdx: index("email_logs_academy_idx").on(table.academyId),
    userIdx: index("email_logs_user_idx").on(table.userId),
    statusIdx: index("email_logs_status_idx").on(table.status),
    createdAtIndex: index("email_logs_created_at_idx").on(table.createdAt),
    templateIdx: index("email_logs_template_idx").on(table.template),
  })
);

