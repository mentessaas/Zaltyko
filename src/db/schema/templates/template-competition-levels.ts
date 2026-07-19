import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { templates } from "./templates";

export const templateCompetitionLevels = pgTable(
  "template_competition_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // e.g., "pre_nivel", "nivel_1", "nivel_2", ..., "fig"
    name: text("name").notNull(), // e.g., "Pre-nivel", "Nivel 1", "Nivel 2", "FIG"
    description: text("description"),
    isCompetitive: boolean("is_competitive").notNull().default(false),
    minAge: integer("min_age"), // Optional age restrictions
    maxAge: integer("max_age"), // Optional age restrictions
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    templateIdx: index("template_competition_levels_template_idx").on(table.templateId),
    sortIdx: index("template_competition_levels_sort_idx").on(table.templateId, table.sortOrder),
  })
);

export type TemplateCompetitionLevel = typeof templateCompetitionLevels.$inferSelect;
export type NewTemplateCompetitionLevel = typeof templateCompetitionLevels.$inferInsert;
