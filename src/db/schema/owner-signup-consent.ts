import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./auth-users";

const zaltyko = pgSchema("zaltyko");

export const ownerSignupConsentPolicy = zaltyko.table(
  "owner_signup_consent_policy",
  {
    singleton: boolean("singleton").primaryKey().default(true),
    policyVersion: text("policy_version").notNull(),
    rolloutAt: timestamp("rollout_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    singletonCheck: check(
      "owner_signup_consent_policy_singleton_check",
      sql`${table.singleton} = true`
    ),
    policyVersionFormatCheck: check(
      "owner_signup_consent_policy_version_format_check",
      sql`${table.policyVersion} ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
  })
);

export const ownerSignupConsents = zaltyko.table(
  "owner_signup_consents",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("granted"),
    policyVersion: text("policy_version").notNull(),
    source: text("source").notNull(),
    consentProof: text("consent_proof").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    policyVersionIdx: index("owner_signup_consents_policy_version_idx").on(
      table.policyVersion
    ),
    stateCheck: check(
      "owner_signup_consents_state_check",
      sql`${table.state} IN ('granted', 'revoked')`
    ),
    sourceCheck: check(
      "owner_signup_consents_source_check",
      sql`${table.source} IN ('signup', 'setup')`
    ),
    policyVersionFormatCheck: check(
      "owner_signup_consents_policy_version_format_check",
      sql`${table.policyVersion} ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    consentProofFormatCheck: check(
      "owner_signup_consents_proof_format_check",
      sql`${table.consentProof} ~ '^(signup|setup):[a-zA-Z0-9_-]{1,128}$'`
    ),
  })
);

export const ownerSignupConsentAudits = zaltyko.table(
  "owner_signup_consent_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Deliberately no FK: legal audit history survives Auth/status deletion.
    userId: uuid("user_id").notNull(),
    event: text("event").notNull().default("grant"),
    policyVersion: text("policy_version").notNull(),
    source: text("source").notNull(),
    consentProof: text("consent_proof").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userRecordedIdx: index("owner_signup_consent_audits_user_recorded_idx").on(
      table.userId,
      table.recordedAt
    ),
    eventCheck: check(
      "owner_signup_consent_audits_event_check",
      sql`${table.event} IN ('grant', 're_grant')`
    ),
    sourceCheck: check(
      "owner_signup_consent_audits_source_check",
      sql`${table.source} IN ('signup', 'setup')`
    ),
    policyVersionFormatCheck: check(
      "owner_signup_consent_audits_policy_version_format_check",
      sql`${table.policyVersion} ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    consentProofFormatCheck: check(
      "owner_signup_consent_audits_proof_format_check",
      sql`${table.consentProof} ~ '^(signup|setup):[a-zA-Z0-9_-]{1,128}$'`
    ),
  })
);
