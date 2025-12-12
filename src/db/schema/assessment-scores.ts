import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { athleteAssessments } from "./athlete-assessments";
import { skillCatalog } from "./skill-catalog";

export const assessmentScores = pgTable(
  "assessment_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => athleteAssessments.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skillCatalog.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    comments: text("comments"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("assessment_scores_tenant_idx").on(table.tenantId),
    assessmentIdx: index("assessment_scores_assessment_idx").on(table.assessmentId),
  })
);
