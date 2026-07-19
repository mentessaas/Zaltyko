import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { templates } from "./templates";

export const templateCompetitionFlow = pgTable(
  "template_competition_flow",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // e.g., "concentracion_autonomica", "copa_reina"
    name: text("name").notNull(), // e.g., "Concentración Autonómica", "Copa de la Reina"
    description: text("description"),
    level: text("level").notNull().default("local"), // "local", "autonomic", "national", "international"
    stageOrder: integer("stage_order").notNull().default(0),
    requirements: jsonb("requirements"), // JSON array of requirements for this stage
    isActive: text("is_active").notNull().default("true"),
  },
  (table) => ({
    templateIdx: index("template_competition_flow_template_idx").on(table.templateId),
    stageIdx: index("template_competition_flow_stage_idx").on(table.templateId, table.stageOrder),
  })
);

export type TemplateCompetitionFlow = typeof templateCompetitionFlow.$inferSelect;
export type NewTemplateCompetitionFlow = typeof templateCompetitionFlow.$inferInsert;
