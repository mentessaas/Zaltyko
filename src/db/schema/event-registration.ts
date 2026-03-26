// Event registration schema
import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow(),
    notes: text("notes"),
  },
  (table) => ({
    eventIdx: index("event_registrations_event_idx").on(table.eventId),
    profileIdx: index("event_registrations_profile_idx").on(table.profileId),
  })
);

export const eventWaitlist = pgTable(
  "event_waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    position: uuid("position").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    eventIdx: index("event_waitlist_event_idx").on(table.eventId),
  })
);

export const eventCategories = pgTable(
  "event_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
  },
  (table) => ({
    eventIdx: index("event_categories_event_idx").on(table.eventId),
  })
);

export const eventPayments = pgTable(
  "event_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => eventRegistrations.id, { onDelete: "cascade" }),
    amount: uuid("amount").notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("EUR"),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    registrationIdx: index("event_payments_registration_idx").on(table.registrationId),
  })
);
