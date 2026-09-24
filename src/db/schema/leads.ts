import { index, text, timestamp, pgTable, uuid } from "drizzle-orm/pg-core";
import { academies } from "./academies";

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id"),
  academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }),
  email: text("email").notNull().unique(),
  name: text("name"),
  source: text("source").default("landing_page"),
  plan: text("plan"), // "starter" | "growth" | "network" | null desde el CTA publico
  metadata: text("metadata"), // JSON string for additional data
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  ownershipIdx: index("leads_ownership_idx").on(table.tenantId, table.academyId),
}));

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
