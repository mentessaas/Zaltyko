import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const skillCatalog = pgTable(
  "skill_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    apparatus: text("apparatus").notNull(),
    skillCode: text("skill_code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    difficulty: integer("difficulty").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("skill_catalog_tenant_idx").on(table.tenantId),
    codeIdx: index("skill_catalog_code_idx").on(table.skillCode),
  })
);
