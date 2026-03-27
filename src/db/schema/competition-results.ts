import { date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { athletes } from "./athletes";
import { events } from "./events";

export const competitionResults = pgTable(
  "competition_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    apparatus: text("apparatus"), // e.g., "rope", "ball", "hoop", "ribbon", "clubs"
    // D-Score (difficulty)
    dScore: integer("d_score"), // Stored as integer (e.g., 15 = 1.5)
    // E-Score (execution)
    eScore: integer("e_score"), // Stored as integer (e.g., 85 = 8.5)
    // Final score
    finalScore: integer("final_score"), // Stored as integer (e.g., 100 = 10.0)
    // Ranking
    rank: integer("rank"),
    qualificationPoints: integer("qualification_points"),
    // Judge panel
    judgePanel: text("judge_panel"), // JSON or text describing judge composition
    // Additional data
    round: text("round"), // e.g., "qualification", "final", "team_final"
    subdivision: text("subdivision"),
    // Notes
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("competition_results_tenant_idx").on(table.tenantId),
    athleteIdx: index("competition_results_athlete_idx").on(table.athleteId),
    eventIdx: index("competition_results_event_idx").on(table.eventId),
    apparatusIdx: index("competition_results_apparatus_idx").on(table.apparatus),
    rankIdx: index("competition_results_rank_idx").on(table.rank),
  })
);

export type CompetitionResult = typeof competitionResults.$inferSelect;
export type NewCompetitionResult = typeof competitionResults.$inferInsert;
