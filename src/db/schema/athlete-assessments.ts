import { date, index, pgTable, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";

import { athletes } from "./athletes";
import { coaches } from "./coaches";
import { assessmentTypeEnum } from "./assessment-extended";

export const athleteAssessments = pgTable(
  "athlete_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id").notNull(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    assessedBy: uuid("assessed_by").references(() => coaches.id, { onDelete: "set null" }),
    assessmentDate: date("assessment_date").notNull(),
    assessmentType: assessmentTypeEnum("assessment_type").notNull().default("technical"),
    rubricId: uuid("rubric_id"),
    apparatus: text("apparatus"),
    overallComment: text("overall_comment"),
    totalScore: text("total_score"), // Stored as JSON or text for flexibility
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("athlete_assessments_tenant_idx").on(table.tenantId),
    athleteIdx: index("athlete_assessments_athlete_idx").on(table.athleteId),
    typeIdx: index("athlete_assessments_type_idx").on(table.assessmentType),
  })
);
