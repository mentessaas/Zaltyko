import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { profiles } from "./profiles";

export const academies = pgTable(
  "academies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    country: text("country"),
    region: text("region"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("academies_tenant_id_idx").on(table.tenantId),
  })
);

