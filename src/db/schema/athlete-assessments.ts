import { date, index, integer, jsonb, pgTable, text, timestamp, uuid, pgEnum, varchar } from "drizzle-orm/pg-core";

import { athletes } from "./athletes";
import { coaches } from "./coaches";
import { assessmentTypeEnum } from "./assessment-extended";

export const assessmentVideos = pgTable(
  "assessment_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => athleteAssessments.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: varchar("title", { length: 200 }),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    duration: text("duration"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    assessmentIdx: index("assessment_videos_assessment_idx").on(table.assessmentId),
  })
);

export const assessmentRubrics = pgTable(
  "assessment_rubrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    type: varchar("type", { length: 100 }).notNull(),
    isActive: text("is_active").notNull().default("true"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("assessment_rubrics_tenant_idx").on(table.tenantId),
  })
);

export const rubricCriteria = pgTable(
  "rubric_criteria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rubricId: uuid("rubric_id")
      .notNull()
      .references(() => assessmentRubrics.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    maxPoints: integer("max_points").default(0),
    weight: integer("weight").default(0),
    orderIndex: integer("order_index").default(0),
  },
  (table) => ({
    rubricIdx: index("rubric_criteria_rubric_idx").on(table.rubricId),
  })
);

export const assessmentTypes = pgTable(
  "assessment_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    isActive: text("is_active").notNull().default("true"),
  },
  (table) => ({
    nameIdx: index("assessment_types_name_idx").on(table.name),
  })
);

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
