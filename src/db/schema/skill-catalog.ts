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
    source: text("source"),
    sourceId: text("source_id"),
    sourceVersion: text("source_version"),
    contentHash: text("content_hash"),
    qualityStatus: text("quality_status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("skill_catalog_tenant_idx").on(table.tenantId),
    codeIdx: index("skill_catalog_code_idx").on(table.skillCode),
    sourceIdentityIdx: index("skill_catalog_source_identity_idx").on(table.source, table.sourceId, table.sourceVersion),
    contentHashIdx: index("skill_catalog_content_hash_idx").on(table.contentHash),
  })
);
