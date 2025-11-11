import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { profiles } from "./profiles";
import { academyTypeEnum } from "./enums";

export const academies = pgTable(
  "academies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    country: text("country"),
    region: text("region"),
    academyType: academyTypeEnum("academy_type").notNull().default("artistica"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    isSuspended: boolean("is_suspended").notNull().default(false),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index("academies_tenant_id_idx").on(table.tenantId),
  })
);

