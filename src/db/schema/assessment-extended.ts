import { pgEnum } from "drizzle-orm/pg-core";

export const assessmentTypeEnum = pgEnum("assessment_type", [
  "technical",
  "artistic",
  "execution",
  "coach_feedback",
  "competition",
  "practice",
]);

export type AssessmentType = typeof assessmentTypeEnum[number];
