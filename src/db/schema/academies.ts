import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { profiles } from "./profiles";
import { academyTypeEnum } from "./enums";

export const academies = pgTable(
  "academies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    academyType: academyTypeEnum("academy_type").notNull().default("artistica"),
    publicDescription: text("public_description"),
    isPublic: boolean("is_public").notNull().default(true),
    logoUrl: text("logo_url"),
    website: text("website"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    address: text("address"),
    socialInstagram: text("social_instagram"),
    socialFacebook: text("social_facebook"),
    socialTwitter: text("social_twitter"),
    socialYoutube: text("social_youtube"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    isSuspended: boolean("is_suspended").notNull().default(false),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    trialStartsAt: timestamp("trial_starts_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    isTrialActive: boolean("is_trial_active").notNull().default(true),
    paymentsConfiguredAt: timestamp("payments_configured_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index("academies_tenant_id_idx").on(table.tenantId),
    publicIdx: index("academies_is_public_idx").on(table.isPublic),
    locationIdx: index("academies_location_idx").on(table.country, table.region, table.city),
    typeIdx: index("academies_type_idx").on(table.academyType),
    contactEmailIdx: index("academies_contact_email_idx").on(table.contactEmail),
    contactPhoneIdx: index("academies_contact_phone_idx").on(table.contactPhone),
  })
);

