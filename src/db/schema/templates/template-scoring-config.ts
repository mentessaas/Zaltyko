import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { templates } from "./templates";

export const templateScoringConfig = pgTable(
  "template_scoring_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" })
      .unique(),
    scoringType: text("scoring_type").notNull().default("d_e"), // "d_e" for FIG D-Score/E-Score, "traditional" for 10.0 system
    // D-Score configuration
    maxDifficulties: integer("max_difficulties").notNull().default(6),
    maxPerGroup: integer("max_per_group").notNull().default(1),
    // E-Score deductions
    deductionsSmall: integer("deductions_small").notNull().default(1), // 0.1 as integer (tenths)
    deductionsMedium: integer("deductions_medium").notNull().default(3),
    deductionsLarge: integer("deductions_large").notNull().default(5),
    deductionsFall: integer("deductions_fall").notNull().default(10),
    // Bonus configuration
    comboBonus2Elements: integer("combo_bonus_2_elements").notNull().default(1), // 0.1
    comboBonus3PlusElements: integer("combo_bonus_3_plus_elements").notNull().default(2), // 0.2
    // Difficulty value range
    minDifficultyValue: integer("min_difficulty_value").notNull().default(1), // 0.1
    maxDifficultyValue: integer("max_difficulty_value").notNull().default(26), // 2.6
    // Additional config as JSON for flexibility
    extraConfig: jsonb("extra_config"),
  },
  (table) => ({
    templateIdx: index("template_scoring_config_template_idx").on(table.templateId),
  })
);

export type TemplateScoringConfig = typeof templateScoringConfig.$inferSelect;
export type NewTemplateScoringConfig = typeof templateScoringConfig.$inferInsert;
