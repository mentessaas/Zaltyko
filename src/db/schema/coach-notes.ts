import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { athletes } from "./athletes";
import { profiles } from "./profiles";

export const coachNotes = pgTable(
  "coach_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "set null" }),
    note: text("note").notNull(),
    sharedWithParents: boolean("shared_with_parents").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    tags: text("tags").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("coach_notes_tenant_idx").on(table.tenantId),
    athleteIdx: index("coach_notes_athlete_idx").on(table.athleteId),
    tagsIdx: index("coach_notes_tags_idx").using("gin", table.tags),
  })
);
