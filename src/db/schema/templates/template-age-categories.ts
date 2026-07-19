import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { templates } from "./templates";

export const templateAgeCategories = pgTable(
  "template_age_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // e.g., "pre_iniciacion", "iniciacion", "alevin"
    name: text("name").notNull(), // e.g., "Pre-iniciación", "Iniciación"
    description: text("description"),
    minAge: integer("min_age").notNull(),
    maxAge: integer("max_age").notNull(),
    isCompetitive: text("is_competitive").notNull().default("false"), // "true" or "false"
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    templateIdx: index("template_age_categories_template_idx").on(table.templateId),
    sortIdx: index("template_age_categories_sort_idx").on(table.templateId, table.sortOrder),
  })
);

export type TemplateAgeCategory = typeof templateAgeCategories.$inferSelect;
export type NewTemplateAgeCategory = typeof templateAgeCategories.$inferInsert;
