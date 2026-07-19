import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { athletes } from "./athletes";
import { events } from "./events";
import { guardians } from "./guardians";
import { profiles } from "./profiles";

export const eventInvitations = pgTable(
  "event_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").references(() => athletes.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id").references(() => guardians.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    status: text("status").notNull().default("pending"),
    invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    response: text("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantEventIdx: index("event_invitations_tenant_event_idx").on(table.tenantId, table.eventId),
    athleteIdx: index("event_invitations_athlete_idx").on(table.athleteId),
    guardianIdx: index("event_invitations_guardian_idx").on(table.guardianId),
    statusIdx: index("event_invitations_status_idx").on(table.status),
    emailIdx: index("event_invitations_email_idx").on(table.email),
  })
);

