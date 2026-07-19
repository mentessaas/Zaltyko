import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { athletes } from "./athletes";
import { profiles } from "./profiles";

export const guardians = pgTable(
  "guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    profileId: uuid("profile_id")
      .references(() => profiles.id, { onDelete: "set null" })
      .unique(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    relationship: text("relationship"),
    notifyEmail: boolean("notify_email").default(true).notNull(),
    notifySms: boolean("notify_sms").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("guardians_tenant_idx").on(table.tenantId),
    emailIdx: index("guardians_email_idx").on(table.email),
  })
);

export const guardianAthletes = pgTable(
  "guardian_athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    relationship: text("relationship"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    guardianIdx: index("guardian_athletes_guardian_idx").on(table.guardianId),
    athleteIdx: index("guardian_athletes_athlete_idx").on(table.athleteId),
    uniq: uniqueIndex("guardian_athletes_unique").on(
      table.tenantId,
      table.guardianId,
      table.athleteId
    ),
  })
);

