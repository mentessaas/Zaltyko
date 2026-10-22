import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { athletes } from "./athletes";
import { profiles } from "./profiles";
import { skillCatalog } from "./skill-catalog";

/** Append-only observations of an athlete's relationship with a catalog skill. */
export const athleteSkills = pgTable(
  "athlete_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id").notNull().references(() => academies.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull().references(() => athletes.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").notNull().references(() => skillCatalog.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("learning"),
    score: integer("score"),
    observedAt: date("observed_at").notNull(),
    observedBy: uuid("observed_by").references(() => profiles.id, { onDelete: "set null" }),
    notes: text("notes"),
    evidence: jsonb("evidence").$type<Array<{ type: string; url?: string; label?: string }>>(),
    visibleToGuardians: boolean("visible_to_guardians").notNull().default(false),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantAthleteIdx: index("athlete_skills_tenant_athlete_idx").on(table.tenantId, table.athleteId),
    athleteSkillIdx: index("athlete_skills_athlete_skill_idx").on(table.athleteId, table.skillId),
    observedAtIdx: index("athlete_skills_observed_at_idx").on(table.observedAt),
    idempotencyIdx: uniqueIndex("athlete_skills_idempotency_idx").on(table.tenantId, table.idempotencyKey),
  }),
);
