import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { athletes } from "./athletes";

export const familyContacts = pgTable(
  "family_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relationship: text("relationship"),
    email: text("email"),
    phone: text("phone"),
    notifyEmail: boolean("notify_email").default(true),
    notifySms: boolean("notify_sms").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("family_contacts_tenant_idx").on(table.tenantId),
    athleteIdx: index("family_contacts_athlete_idx").on(table.athleteId),
  })
);
