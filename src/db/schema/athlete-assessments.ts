import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { athletes } from "./athletes";
import { coaches } from "./coaches";

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
    apparatus: text("apparatus"),
    overallComment: text("overall_comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("athlete_assessments_tenant_idx").on(table.tenantId),
    athleteIdx: index("athlete_assessments_athlete_idx").on(table.athleteId),
  })
);
