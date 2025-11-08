import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    date: date("date"),
    location: text("location"),
    status: text("status").default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantAcademyIdx: index("events_tenant_academy_idx").on(table.tenantId, table.academyId),
  })
);

