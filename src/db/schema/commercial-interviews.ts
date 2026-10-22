import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { leads } from "./leads";
import { profiles } from "./profiles";

/**
 * Evidencia estructurada de discovery. Una fila completada representa una
 * entrevista real; los registros programados no cuentan para el objetivo 10/10.
 */
export const commercialInterviews = pgTable(
  "commercial_interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    academyFingerprint: text("academy_fingerprint").notNull(),
    academyName: text("academy_name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    countryCode: text("country_code"),
    city: text("city"),
    modality: text("modality"),
    athleteCount: integer("athlete_count"),
    coachCount: integer("coach_count"),
    locationCount: integer("location_count").notNull().default(1),
    currentTools: text("current_tools"),
    biggestPain: text("biggest_pain"),
    mostValuableFeature: text("most_valuable_feature"),
    primaryObjection: text("primary_objection"),
    easyPriceEurCents: integer("easy_price_eur_cents"),
    limitPriceEurCents: integer("limit_price_eur_cents"),
    preferredPricingModel: text("preferred_pricing_model"),
    freePlanExpectation: text("free_plan_expectation"),
    upgradeTrigger: text("upgrade_trigger"),
    betaInterest: text("beta_interest").notNull().default("unknown"),
    willingnessToPay: text("willingness_to_pay").notNull().default("unknown"),
    status: text("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    createdByProfileId: uuid("created_by_profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    updatedByProfileId: uuid("updated_by_profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusCompletedIdx: index("commercial_interviews_status_completed_idx").on(
      table.status,
      table.completedAt
    ),
    leadIdx: index("commercial_interviews_lead_idx").on(table.leadId),
    academyFingerprintUnique: uniqueIndex("commercial_interviews_academy_fingerprint_unique").on(
      table.academyFingerprint
    ),
    statusCheck: check(
      "commercial_interviews_status_check",
      sql`${table.status} in ('scheduled', 'completed', 'no_show', 'cancelled')`
    ),
    betaInterestCheck: check(
      "commercial_interviews_beta_interest_check",
      sql`${table.betaInterest} in ('unknown', 'yes', 'no', 'maybe')`
    ),
    willingnessToPayCheck: check(
      "commercial_interviews_willingness_to_pay_check",
      sql`${table.willingnessToPay} in ('unknown', 'yes', 'no', 'maybe')`
    ),
    nonNegativeCountsCheck: check(
      "commercial_interviews_non_negative_counts_check",
      sql`coalesce(${table.athleteCount}, 0) >= 0 and coalesce(${table.coachCount}, 0) >= 0 and ${table.locationCount} > 0`
    ),
    priceRangeCheck: check(
      "commercial_interviews_price_range_check",
      sql`coalesce(${table.easyPriceEurCents}, 0) >= 0 and coalesce(${table.limitPriceEurCents}, 0) >= coalesce(${table.easyPriceEurCents}, 0)`
    ),
    completedEvidenceCheck: check(
      "commercial_interviews_completed_evidence_check",
      sql`${table.status} <> 'completed' or (${table.completedAt} is not null and ${table.athleteCount} is not null and nullif(btrim(${table.currentTools}), '') is not null and nullif(btrim(${table.biggestPain}), '') is not null and nullif(btrim(${table.primaryObjection}), '') is not null and ${table.easyPriceEurCents} is not null and ${table.limitPriceEurCents} is not null)`
    ),
  })
);

export type CommercialInterview = typeof commercialInterviews.$inferSelect;
export type NewCommercialInterview = typeof commercialInterviews.$inferInsert;
