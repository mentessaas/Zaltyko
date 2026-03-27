import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { templates } from "./templates";

export const templateApparatus = pgTable(
  "template_apparatus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // e.g., "rope", "ball", "clubs", "hoop", "ribbon"
    name: text("name").notNull(), // e.g., "Cuerda", "Pelota", "Mazas", "Aro", "Cinta"
    shortName: text("short_name"), // e.g., "C", "P", "M", "A", "Ci"
    hasRotation: boolean("has_rotation").notNull().default(false),
    isOptional: boolean("is_optional").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    templateIdx: index("template_apparatus_template_idx").on(table.templateId),
    sortIdx: index("template_apparatus_sort_idx").on(table.templateId, table.sortOrder),
  })
);

export type TemplateApparatus = typeof templateApparatus.$inferSelect;
export type NewTemplateApparatus = typeof templateApparatus.$inferInsert;
