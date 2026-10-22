import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./auth-users";

/**
 * Authoritative domain schema for the rebuilt product.
 *
 * Legacy `public.*` tables remain outside this boundary while the new modules
 * are implemented. New product code must not add domain concepts back to the
 * legacy academy/tenant dual model.
 */
export const zaltyko = pgSchema("zaltyko");

export const organizationStatus = zaltyko.enum("organization_status", [
  "trial",
  "active",
  "suspended",
  "closed",
]);

export const saasPlanCode = zaltyko.enum("saas_plan_code", [
  "free",
  "starter",
  "growth",
  "network",
]);

export const entitlementSource = zaltyko.enum("entitlement_source", [
  "bootstrap",
  "stripe_subscription",
  "contract",
  "trial",
  "trial_expired",
]);

export const stripeEnvironment = zaltyko.enum("stripe_environment", [
  "test",
  "live",
]);

export const saasBillingInterval = zaltyko.enum("saas_billing_interval", [
  "month",
  "year",
]);

export const familyCollectionMode = zaltyko.enum("family_collection_mode", [
  "manual",
  "automatic",
]);

export const paymentAuthorizationStatus = zaltyko.enum(
  "payment_authorization_status",
  ["pending", "active", "revoked", "expired"]
);

export const organizationPaymentAccountStatus = zaltyko.enum(
  "organization_payment_account_status",
  ["pending", "onboarding", "restricted", "active", "disabled"]
);

export const memberRole = zaltyko.enum("member_role", [
  "owner",
  "manager",
  "admin",
  "coach",
]);

export const memberStatus = zaltyko.enum("member_status", [
  "invited",
  "active",
  "suspended",
  "revoked",
]);

export const locationScopeMode = zaltyko.enum("location_scope_mode", [
  "all",
  "selected",
]);

export const lifecycleStatus = zaltyko.enum("lifecycle_status", [
  "draft",
  "active",
  "archived",
]);

export const sportProfileStatus = zaltyko.enum("sport_profile_status", [
  "identity_only",
  "verified",
  "draft",
  "retired",
]);

export const organizationSportRole = zaltyko.enum("organization_sport_role", [
  "primary",
  "additional",
]);

export const organizationSportStatus = zaltyko.enum(
  "organization_sport_status",
  ["active", "inactive"]
);

export const programKind = zaltyko.enum("program_kind", [
  "gymnastics_sport",
  "complementary_activity",
]);

export const groupMembershipStatus = zaltyko.enum("group_membership_status", [
  "pending",
  "active",
  "paused",
  "ended",
]);

export const sessionStatus = zaltyko.enum("session_status", [
  "scheduled",
  "completed",
  "cancelled",
]);

export const enrollmentStatus = zaltyko.enum("enrollment_status", [
  "pending",
  "trial",
  "active",
  "paused",
  "cancelled",
  "completed",
]);

export const enrollmentSource = zaltyko.enum("enrollment_source", [
  "import",
  "owner",
  "parent",
  "trial",
  "waitlist",
  "transfer",
  "api",
]);

export const attendanceStatus = zaltyko.enum("attendance_status", [
  "present",
  "absent",
  "excused",
  "late",
]);

export const billingCadence = zaltyko.enum("billing_cadence", [
  "one_time",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
]);

export const outboxStatus = zaltyko.enum("outbox_status", [
  "pending",
  "processing",
  "processed",
  "failed",
]);

export const familyRelationship = zaltyko.enum("family_relationship", [
  "parent",
  "legal_guardian",
  "foster_guardian",
  "other",
]);

export const guardianContactKind = zaltyko.enum("guardian_contact_kind", [
  "email",
  "phone",
]);

export const contactConsentStatus = zaltyko.enum("contact_consent_status", [
  "unknown",
  "granted",
  "denied",
  "revoked",
]);

export const trialStatus = zaltyko.enum("trial_status", [
  "booked",
  "attended",
  "completed",
  "no_show",
  "cancelled",
  "converted",
]);

export const trialFollowupChannel = zaltyko.enum("trial_followup_channel", [
  "email",
  "phone",
  "sms",
  "in_person",
]);

export const trialFollowupOutcome = zaltyko.enum("trial_followup_outcome", [
  "contacted",
  "no_answer",
  "converted",
  "waitlisted",
  "not_interested",
  "follow_up_needed",
]);

export const waitlistStatus = zaltyko.enum("waitlist_status", [
  "waiting",
  "offered",
  "converted",
  "withdrawn",
  "expired",
]);

export const waitlistOfferStatus = zaltyko.enum("waitlist_offer_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
  "revoked",
]);

export const organizations = zaltyko.table(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    status: organizationStatus("status").notNull().default("trial"),
    countryCode: text("country_code").notNull().default("ES"),
    defaultCurrency: text("default_currency").notNull().default("EUR"),
    defaultTimezone: text("default_timezone")
      .notNull()
      .default("Europe/Madrid"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organizations_id_country_uq").on(table.id, table.countryCode),
    check("organizations_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check(
      "organizations_country_code_format",
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`
    ),
    check(
      "organizations_default_currency_format",
      sql`${table.defaultCurrency} ~ '^[A-Z]{3}$'`
    ),
  ]
);

export const locations = zaltyko.table(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("Europe/Madrid"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("locations_organization_code_uq").on(
      table.organizationId,
      table.code
    ),
    uniqueIndex("locations_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("locations_organization_idx").on(table.organizationId),
    check("locations_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check(
      "locations_code_format",
      sql`${table.code} ~ '^[a-z0-9][a-z0-9-]{1,31}$'`
    ),
  ]
);

export const facilities = zaltyko.table(
  "facilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("facilities_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("facilities_location_idx").on(table.organizationId, table.locationId),
    check("facilities_name_not_blank", sql`btrim(${table.name}) <> ''`),
    foreignKey({
      name: "facilities_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("cascade"),
  ]
);

export const spaces = zaltyko.table(
  "spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    facilityId: uuid("facility_id").notNull(),
    name: text("name").notNull(),
    capacity: integer("capacity"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("spaces_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("spaces_location_idx").on(table.organizationId, table.locationId),
    index("spaces_facility_idx").on(table.organizationId, table.facilityId),
    check(
      "spaces_capacity_positive",
      sql`${table.capacity} is null or ${table.capacity} > 0`
    ),
    foreignKey({
      name: "spaces_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "spaces_facility_fk",
      columns: [table.organizationId, table.facilityId],
      foreignColumns: [facilities.organizationId, facilities.id],
    }).onDelete("cascade"),
  ]
);

export const organizationMembers = zaltyko.table(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    status: memberStatus("status").notNull().default("invited"),
    locationScopeMode: locationScopeMode("location_scope_mode")
      .notNull()
      .default("selected"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_members_user_uq").on(
      table.organizationId,
      table.userId
    ),
    uniqueIndex("organization_members_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("organization_members_user_idx").on(table.userId),
  ]
);

export const organizationBootstrapCommands = zaltyko.table(
  "organization_bootstrap_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    organizationId: uuid("organization_id").notNull(),
    locationId: uuid("location_id").notNull(),
    memberId: uuid("member_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_bootstrap_commands_user_key_uq").on(
      table.userId,
      table.idempotencyKey
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "organization_bootstrap_commands_organization_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
      name: "organization_bootstrap_commands_location_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.memberId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.id,
      ],
      name: "organization_bootstrap_commands_member_fk",
    }).onDelete("cascade"),
    check(
      "organization_bootstrap_commands_idempotency_length",
      sql`length(btrim(${table.idempotencyKey})) between 8 and 150`
    ),
    check(
      "organization_bootstrap_commands_hash_format",
      sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`
    ),
  ]
);

export const memberLocationScopes = zaltyko.table(
  "member_location_scopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull(),
    locationId: uuid("location_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("member_location_scopes_member_location_uq").on(
      table.organizationId,
      table.memberId,
      table.locationId
    ),
    index("member_location_scopes_location_idx").on(
      table.organizationId,
      table.locationId
    ),
    foreignKey({
      name: "member_location_scopes_member_fk",
      columns: [table.organizationId, table.memberId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "member_location_scopes_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("cascade"),
  ]
);

export const people = zaltyko.table(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    givenName: text("given_name").notNull(),
    familyName: text("family_name").notNull(),
    preferredName: text("preferred_name"),
    dateOfBirth: date("date_of_birth"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("people_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("people_organization_idx").on(table.organizationId),
    check("people_given_name_not_blank", sql`btrim(${table.givenName}) <> ''`),
    check(
      "people_family_name_not_blank",
      sql`btrim(${table.familyName}) <> ''`
    ),
  ]
);

export const athletes = zaltyko.table(
  "athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    externalReference: text("external_reference"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("athletes_organization_person_uq").on(
      table.organizationId,
      table.personId
    ),
    uniqueIndex("athletes_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("athletes_organization_active_idx").on(
      table.organizationId,
      table.isActive
    ),
    foreignKey({
      name: "athletes_person_fk",
      columns: [table.organizationId, table.personId],
      foreignColumns: [people.organizationId, people.id],
    }).onDelete("restrict"),
  ]
);

export const families = zaltyko.table(
  "families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    externalReference: text("external_reference"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("families_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("families_organization_active_idx").on(
      table.organizationId,
      table.isActive
    ),
  ]
);

export const guardians = zaltyko.table(
  "guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    authUserId: uuid("auth_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("guardians_organization_person_uq").on(
      table.organizationId,
      table.personId
    ),
    uniqueIndex("guardians_organization_auth_user_uq").on(
      table.organizationId,
      table.authUserId
    ),
    uniqueIndex("guardians_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("guardians_auth_user_idx").on(table.authUserId),
    foreignKey({
      name: "guardians_person_fk",
      columns: [table.organizationId, table.personId],
      foreignColumns: [people.organizationId, people.id],
    }).onDelete("restrict"),
  ]
);

export const guardianContacts = zaltyko.table(
  "guardian_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id").notNull(),
    kind: guardianContactKind("kind").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("guardian_contacts_value_uq").on(
      table.organizationId,
      table.guardianId,
      table.kind,
      table.normalizedValue
    ),
    uniqueIndex("guardian_contacts_primary_kind_uq")
      .on(table.organizationId, table.guardianId, table.kind)
      .where(sql`${table.isPrimary}`),
    check(
      "guardian_contacts_value_not_blank",
      sql`btrim(${table.value}) <> ''`
    ),
    check(
      "guardian_contacts_normalized_not_blank",
      sql`btrim(${table.normalizedValue}) <> ''`
    ),
    foreignKey({
      name: "guardian_contacts_guardian_fk",
      columns: [table.organizationId, table.guardianId],
      foreignColumns: [guardians.organizationId, guardians.id],
    }).onDelete("cascade"),
  ]
);

export const familyGuardians = zaltyko.table(
  "family_guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    guardianId: uuid("guardian_id").notNull(),
    relationship: familyRelationship("relationship").notNull(),
    canViewAthletes: boolean("can_view_athletes").notNull().default(true),
    canManageEnrollments: boolean("can_manage_enrollments")
      .notNull()
      .default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("family_guardians_family_guardian_uq").on(
      table.organizationId,
      table.familyId,
      table.guardianId
    ),
    foreignKey({
      name: "family_guardians_family_fk",
      columns: [table.organizationId, table.familyId],
      foreignColumns: [families.organizationId, families.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "family_guardians_guardian_fk",
      columns: [table.organizationId, table.guardianId],
      foreignColumns: [guardians.organizationId, guardians.id],
    }).onDelete("cascade"),
  ]
);

export const familyMembers = zaltyko.table(
  "family_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    athleteId: uuid("athlete_id").notNull(),
    relationship: familyRelationship("relationship").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("family_members_one_open_uq")
      .on(table.organizationId, table.familyId, table.athleteId)
      .where(sql`${table.endsOn} is null`),
    index("family_members_athlete_idx").on(
      table.organizationId,
      table.athleteId,
      table.endsOn
    ),
    check(
      "family_members_dates_valid",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`
    ),
    foreignKey({
      name: "family_members_family_fk",
      columns: [table.organizationId, table.familyId],
      foreignColumns: [families.organizationId, families.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "family_members_athlete_fk",
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("restrict"),
  ]
);

export const familyPayers = zaltyko.table(
  "family_payers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    guardianId: uuid("guardian_id").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("family_payers_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("family_payers_organization_family_id_uq").on(
      table.organizationId,
      table.familyId,
      table.id
    ),
    uniqueIndex("family_payers_family_guardian_uq").on(
      table.organizationId,
      table.familyId,
      table.guardianId,
      table.startsOn
    ),
    uniqueIndex("family_payers_one_primary_uq")
      .on(table.organizationId, table.familyId)
      .where(sql`${table.isPrimary} and ${table.endsOn} is null`),
    index("family_payers_guardian_idx").on(
      table.organizationId,
      table.guardianId,
      table.endsOn
    ),
    check(
      "family_payers_dates_valid",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`
    ),
    foreignKey({
      name: "family_payers_family_guardian_link_fk",
      columns: [table.organizationId, table.familyId, table.guardianId],
      foreignColumns: [
        familyGuardians.organizationId,
        familyGuardians.familyId,
        familyGuardians.guardianId,
      ],
    }).onDelete("restrict"),
  ]
);

/** One explicit manual/automatic request per family, never an authorization. */
export const familyCollectionPreferences = zaltyko.table(
  "family_collection_preferences",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    requestedMode: familyCollectionMode("requested_mode")
      .notNull()
      .default("manual"),
    version: integer("version").notNull().default(1),
    entitlementRevision: integer("entitlement_revision"),
    updatedByMemberId: uuid("updated_by_member_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "family_collection_preferences_pkey",
      columns: [table.organizationId, table.familyId],
    }),
    index("family_collection_preferences_mode_idx").on(
      table.organizationId,
      table.requestedMode,
      table.entitlementRevision
    ),
    check(
      "family_collection_preferences_version_positive",
      sql`${table.version} > 0`
    ),
    check(
      "family_collection_preferences_entitlement_revision_positive",
      sql`${table.entitlementRevision} is null or ${table.entitlementRevision} > 0`
    ),
    check(
      "family_collection_preferences_entitlement_revision_positive",
      sql`${table.entitlementRevision} is null or ${table.entitlementRevision} > 0`
    ),
    foreignKey({
      name: "family_collection_preferences_family_fk",
      columns: [table.organizationId, table.familyId],
      foreignColumns: [families.organizationId, families.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "family_collection_preferences_member_fk",
      columns: [table.organizationId, table.updatedByMemberId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.id,
      ],
    }).onDelete("restrict"),
  ]
);

/**
 * Server-owned Connect account projection for academy direct charges. It is
 * separate from the processor account used for the academy's Zaltyko plan.
 */
export const organizationPaymentProviderAccounts = zaltyko.table(
  "organization_payment_provider_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    processor: text("processor").notNull().default("stripe"),
    environment: stripeEnvironment("environment").notNull(),
    providerAccountReference: text("provider_account_reference").notNull(),
    accountsApiGeneration: integer("accounts_api_generation")
      .notNull()
      .default(2),
    chargeModel: text("charge_model").notNull().default("direct"),
    dashboardAccess: text("dashboard_access").notNull().default("full"),
    feesCollector: text("fees_collector").notNull().default("stripe"),
    lossesCollector: text("losses_collector").notNull().default("stripe"),
    status: organizationPaymentAccountStatus("status")
      .notNull()
      .default("pending"),
    cardPaymentsCapabilityStatus: text("card_payments_capability_status")
      .notNull()
      .default("pending"),
    revision: integer("revision").notNull().default(1),
    lastProviderEventReference: text("last_provider_event_reference"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex(
      "organization_payment_provider_accounts_organization_id_id_uq"
    ).on(table.organizationId, table.id),
    uniqueIndex(
      "organization_payment_provider_accounts_org_processor_env_uq"
    ).on(table.organizationId, table.processor, table.environment),
    uniqueIndex(
      "organization_payment_provider_accounts_provider_reference_uq"
    ).on(table.processor, table.environment, table.providerAccountReference),
    index("organization_payment_provider_accounts_collection_ready_idx").on(
      table.organizationId,
      table.environment,
      table.status,
      table.cardPaymentsCapabilityStatus
    ),
    check(
      "organization_payment_provider_accounts_processor_supported",
      sql.raw("processor = 'stripe'")
    ),
    check(
      "organization_payment_provider_accounts_reference_valid",
      sql.raw("provider_account_reference ~ '^acct_[A-Za-z0-9]+$'")
    ),
    check(
      "organization_payment_provider_accounts_api_generation_supported",
      sql.raw("accounts_api_generation = 2")
    ),
    check(
      "organization_payment_provider_accounts_charge_model_supported",
      sql.raw("charge_model = 'direct'")
    ),
    check(
      "organization_payment_provider_accounts_dashboard_supported",
      sql.raw("dashboard_access = 'full'")
    ),
    check(
      "organization_payment_provider_accounts_fees_collector_supported",
      sql.raw("fees_collector = 'stripe'")
    ),
    check(
      "organization_payment_provider_accounts_losses_collector_supported",
      sql.raw("losses_collector = 'stripe'")
    ),
    check(
      "organization_payment_provider_accounts_capability_status_not_blank",
      sql.raw("btrim(card_payments_capability_status) <> ''")
    ),
    check(
      "organization_payment_provider_accounts_revision_positive",
      sql.raw("revision > 0")
    ),
  ]
);

/**
 * Restricted payment-account and consent references for a family payer. No
 * card, bank-account, or raw identity data belongs in this table.
 */
export const familyPaymentAuthorizations = zaltyko.table(
  "family_payment_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    familyPayerId: uuid("family_payer_id").notNull(),
    paymentProviderAccountId: uuid("payment_provider_account_id").notNull(),
    status: paymentAuthorizationStatus("status").notNull().default("pending"),
    providerSetupReference: text("provider_setup_reference").notNull(),
    paymentMethodReference: text("payment_method_reference").notNull(),
    mandateReference: text("mandate_reference"),
    consentVersion: text("consent_version"),
    consentEvidenceReference: text("consent_evidence_reference"),
    consentEvidenceSha256: text("consent_evidence_sha256"),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    consentedByGuardianId: uuid("consented_by_guardian_id"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("family_payment_authorizations_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("family_payment_authorizations_setup_uq").on(
      table.organizationId,
      table.paymentProviderAccountId,
      table.providerSetupReference
    ),
    uniqueIndex("family_payment_authorizations_active_method_uq")
      .on(
        table.organizationId,
        table.paymentProviderAccountId,
        table.familyPayerId
      )
      .where(sql`${table.status} = 'active'`),
    index("family_payment_authorizations_payer_status_idx").on(
      table.organizationId,
      table.familyId,
      table.familyPayerId,
      table.status,
      table.validUntil
    ),
    check(
      "family_payment_authorizations_references_not_blank",
      sql.raw(
        "btrim(provider_setup_reference) <> '' and btrim(payment_method_reference) <> '' and (mandate_reference is null or btrim(mandate_reference) <> '')"
      )
    ),
    check(
      "family_payment_authorizations_consent_digest_valid",
      sql`${table.consentEvidenceSha256} is null or ${table.consentEvidenceSha256} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "family_payment_authorizations_consent_reference_not_blank",
      sql`${table.consentEvidenceReference} is null or btrim(${table.consentEvidenceReference}) <> ''`
    ),
    check(
      "family_payment_authorizations_active_consent_valid",
      sql`${table.status} <> 'active' or (${table.consentVersion} is not null and btrim(${table.consentVersion}) <> '' and ${table.consentEvidenceReference} is not null and ${table.consentEvidenceSha256} is not null and ${table.consentedAt} is not null and ${table.consentedByGuardianId} is not null and (${table.validUntil} is null or ${table.validUntil} > ${table.consentedAt}) and ${table.revokedAt} is null)`
    ),
    check(
      "family_payment_authorizations_revocation_valid",
      sql`(${table.status} = 'revoked' and ${table.revokedAt} is not null) or (${table.status} <> 'revoked' and ${table.revokedAt} is null)`
    ),
    foreignKey({
      name: "family_payment_authorizations_payer_fk",
      columns: [table.organizationId, table.familyId, table.familyPayerId],
      foreignColumns: [
        familyPayers.organizationId,
        familyPayers.familyId,
        familyPayers.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_payment_authorizations_provider_account_fk",
      columns: [table.organizationId, table.paymentProviderAccountId],
      foreignColumns: [
        organizationPaymentProviderAccounts.organizationId,
        organizationPaymentProviderAccounts.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_payment_authorizations_guardian_fk",
      columns: [
        table.organizationId,
        table.familyId,
        table.consentedByGuardianId,
      ],
      foreignColumns: [
        familyGuardians.organizationId,
        familyGuardians.familyId,
        familyGuardians.guardianId,
      ],
    }).onDelete("restrict"),
  ]
);

export const staffProfiles = zaltyko.table(
  "staff_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    memberId: uuid("member_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("staff_profiles_organization_person_uq").on(
      table.organizationId,
      table.personId
    ),
    uniqueIndex("staff_profiles_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    foreignKey({
      name: "staff_profiles_person_fk",
      columns: [table.organizationId, table.personId],
      foreignColumns: [people.organizationId, people.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "staff_profiles_member_fk",
      columns: [table.organizationId, table.memberId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.id,
      ],
    }).onDelete("restrict"),
  ]
);

/** Versioned sport identity/rule packs; identity-only rows carry no federation rules. */
export const sportProfiles = zaltyko.table(
  "sport_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryCode: text("country_code").notNull(),
    disciplineKey: text("discipline_key").notNull(),
    federationCode: text("federation_code").notNull().default("unconfigured"),
    profileVersion: text("profile_version").notNull(),
    status: sportProfileStatus("status").notNull().default("identity_only"),
    configurationSchemaVersion: integer("configuration_schema_version")
      .notNull()
      .default(1),
    configuration: jsonb("configuration")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sourceTitle: text("source_title"),
    sourceUrl: text("source_url"),
    sourceVerifiedAt: timestamp("source_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sport_profiles_country_id_uq").on(table.countryCode, table.id),
    uniqueIndex("sport_profiles_version_uq").on(
      table.countryCode,
      table.disciplineKey,
      table.federationCode,
      table.profileVersion
    ),
    check(
      "sport_profiles_country_code_format",
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`
    ),
    check(
      "sport_profiles_federation_code_format",
      sql`${table.federationCode} ~ '^[a-z][a-z0-9_-]{1,47}$'`
    ),
    check(
      "sport_profiles_discipline_key_format",
      sql`${table.disciplineKey} ~ '^[a-z][a-z0-9_]{1,47}$'`
    ),
    check(
      "sport_profiles_version_not_blank",
      sql`btrim(${table.profileVersion}) <> ''`
    ),
    check(
      "sport_profiles_configuration_version_positive",
      sql`${table.configurationSchemaVersion} > 0`
    ),
    check(
      "sport_profiles_verified_source_required",
      sql`${table.status} <> 'verified' or (${table.sourceTitle} is not null and ${table.sourceUrl} is not null and ${table.sourceVerifiedAt} is not null)`
    ),
    check(
      "sport_profiles_identity_only_empty",
      sql`${table.status} <> 'identity_only' or ${table.configuration} = '{}'::jsonb`
    ),
    check(
      "sport_profiles_source_url_https",
      sql`${table.sourceUrl} is null or ${table.sourceUrl} ~ '^https://'`
    ),
  ]
);

export const organizationSports = zaltyko.table(
  "organization_sports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    countryCode: text("country_code").notNull(),
    sportProfileId: uuid("sport_profile_id").notNull(),
    role: organizationSportRole("role").notNull(),
    status: organizationSportStatus("status").notNull().default("active"),
    startsOn: date("starts_on")
      .notNull()
      .default(sql`CURRENT_DATE`),
    endsOn: date("ends_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_sports_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("organization_sports_active_profile_uq")
      .on(table.organizationId, table.sportProfileId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("organization_sports_primary_active_uq")
      .on(table.organizationId)
      .where(sql`${table.role} = 'primary' and ${table.status} = 'active'`),
    index("organization_sports_profile_idx").on(
      table.countryCode,
      table.sportProfileId
    ),
    foreignKey({
      name: "organization_sports_country_fk",
      columns: [table.organizationId, table.countryCode],
      foreignColumns: [organizations.id, organizations.countryCode],
    }).onDelete("cascade"),
    foreignKey({
      name: "organization_sports_profile_fk",
      columns: [table.countryCode, table.sportProfileId],
      foreignColumns: [sportProfiles.countryCode, sportProfiles.id],
    }).onDelete("restrict"),
    check(
      "organization_sports_dates_valid",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`
    ),
  ]
);

export const programs = zaltyko.table(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: programKind("kind").notNull(),
    organizationSportId: uuid("organization_sport_id"),
    activityKey: text("activity_key"),
    status: lifecycleStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("programs_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("programs_organization_status_idx").on(
      table.organizationId,
      table.status
    ),
    foreignKey({
      name: "programs_organization_sport_fk",
      columns: [table.organizationId, table.organizationSportId],
      foreignColumns: [
        organizationSports.organizationId,
        organizationSports.id,
      ],
    }).onDelete("restrict"),
    check(
      "programs_classification_valid",
      sql`(${table.kind} = 'gymnastics_sport' and ${table.organizationSportId} is not null and ${table.activityKey} is null) or (${table.kind} = 'complementary_activity' and ${table.organizationSportId} is null and ${table.activityKey} is not null and btrim(${table.activityKey}) <> '')`
    ),
    check(
      "programs_activity_key_format",
      sql`${table.activityKey} is null or ${table.activityKey} ~ '^[a-z][a-z0-9_]{1,47}$'`
    ),
  ]
);

export const groups = zaltyko.table(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    programId: uuid("program_id"),
    name: text("name").notNull(),
    capacity: integer("capacity"),
    status: lifecycleStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("groups_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("groups_location_status_idx").on(
      table.organizationId,
      table.locationId,
      table.status
    ),
    check(
      "groups_capacity_positive",
      sql`${table.capacity} is null or ${table.capacity} > 0`
    ),
    foreignKey({
      name: "groups_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "groups_program_fk",
      columns: [table.organizationId, table.programId],
      foreignColumns: [programs.organizationId, programs.id],
    }).onDelete("restrict"),
  ]
);

/** Canonical M:N relationship. Never replace with athletes.group_id. */
export const groupMemberships = zaltyko.table(
  "group_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull(),
    athleteId: uuid("athlete_id").notNull(),
    status: groupMembershipStatus("status").notNull().default("active"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("group_memberships_group_idx").on(
      table.organizationId,
      table.groupId,
      table.status
    ),
    index("group_memberships_athlete_idx").on(
      table.organizationId,
      table.athleteId,
      table.status
    ),
    uniqueIndex("group_memberships_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("group_memberships_open_uq")
      .on(table.organizationId, table.groupId, table.athleteId)
      .where(sql`${table.status} in ('pending', 'active', 'paused')`),
    check(
      "group_memberships_dates_valid",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`
    ),
    foreignKey({
      name: "group_memberships_group_fk",
      columns: [table.organizationId, table.groupId],
      foreignColumns: [groups.organizationId, groups.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "group_memberships_athlete_fk",
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("cascade"),
  ]
);

export const groupMembershipHistory = zaltyko.table(
  "group_membership_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull(),
    fromStatus: groupMembershipStatus("from_status"),
    toStatus: groupMembershipStatus("to_status").notNull(),
    reasonCode: text("reason_code"),
    changedByMemberId: uuid("changed_by_member_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    effectiveOn: date("effective_on").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("group_membership_history_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    check(
      "group_membership_history_reason_code_valid",
      sql`${table.reasonCode} is null or ${table.reasonCode} in (
        'academy_request', 'family_request', 'athlete_request',
        'schedule_change', 'temporary_pause', 'other'
      )`
    ),
    index("group_membership_history_membership_idx").on(
      table.organizationId,
      table.membershipId,
      table.changedAt
    ),
    index("group_membership_history_effective_idx").on(
      table.organizationId,
      table.membershipId,
      table.effectiveOn,
      table.changedAt
    ),
    foreignKey({
      name: "group_membership_history_membership_fk",
      columns: [table.organizationId, table.membershipId],
      foreignColumns: [groupMemberships.organizationId, groupMemberships.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "group_membership_history_member_fk",
      columns: [table.organizationId, table.changedByMemberId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const classTemplates = zaltyko.table(
  "class_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    programId: uuid("program_id"),
    defaultSpaceId: uuid("default_space_id"),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
    status: lifecycleStatus("status").notNull().default("draft"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("class_templates_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("class_templates_organization_location_id_uq").on(
      table.organizationId,
      table.locationId,
      table.id
    ),
    index("class_templates_location_status_idx").on(
      table.organizationId,
      table.locationId,
      table.status
    ),
    check("class_templates_capacity_positive", sql`${table.capacity} > 0`),
    check(
      "class_templates_dates_valid",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`
    ),
    foreignKey({
      name: "class_templates_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "class_templates_program_fk",
      columns: [table.organizationId, table.programId],
      foreignColumns: [programs.organizationId, programs.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "class_templates_space_fk",
      columns: [table.organizationId, table.defaultSpaceId],
      foreignColumns: [spaces.organizationId, spaces.id],
    }).onDelete("restrict"),
  ]
);

export const classTemplateGroups = zaltyko.table(
  "class_template_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    classTemplateId: uuid("class_template_id").notNull(),
    groupId: uuid("group_id").notNull(),
  },
  (table) => [
    uniqueIndex("class_template_groups_uq").on(
      table.organizationId,
      table.classTemplateId,
      table.groupId
    ),
    foreignKey({
      name: "class_template_groups_template_fk",
      columns: [table.organizationId, table.classTemplateId],
      foreignColumns: [classTemplates.organizationId, classTemplates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "class_template_groups_group_fk",
      columns: [table.organizationId, table.groupId],
      foreignColumns: [groups.organizationId, groups.id],
    }).onDelete("cascade"),
  ]
);

export const classTemplateWeekdays = zaltyko.table(
  "class_template_weekdays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    classTemplateId: uuid("class_template_id").notNull(),
    isoWeekday: integer("iso_weekday").notNull(),
    startsAtLocal: time("starts_at_local").notNull(),
    endsAtLocal: time("ends_at_local").notNull(),
  },
  (table) => [
    uniqueIndex("class_template_weekdays_uq").on(
      table.organizationId,
      table.classTemplateId,
      table.isoWeekday,
      table.startsAtLocal
    ),
    check(
      "class_template_weekdays_day_valid",
      sql`${table.isoWeekday} between 1 and 7`
    ),
    check(
      "class_template_weekdays_time_valid",
      sql`${table.endsAtLocal} > ${table.startsAtLocal}`
    ),
    foreignKey({
      name: "class_template_weekdays_template_fk",
      columns: [table.organizationId, table.classTemplateId],
      foreignColumns: [classTemplates.organizationId, classTemplates.id],
    }).onDelete("cascade"),
  ]
);

export const sessions = zaltyko.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    classTemplateId: uuid("class_template_id").notNull(),
    spaceId: uuid("space_id"),
    status: sessionStatus("status").notNull().default("scheduled"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    capacityOverride: integer("capacity_override"),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("sessions_organization_location_id_uq").on(
      table.organizationId,
      table.locationId,
      table.id
    ),
    uniqueIndex("sessions_template_start_uq").on(
      table.organizationId,
      table.classTemplateId,
      table.startsAt
    ),
    index("sessions_location_start_idx").on(
      table.organizationId,
      table.locationId,
      table.startsAt
    ),
    check("sessions_time_valid", sql`${table.endsAt} > ${table.startsAt}`),
    check(
      "sessions_capacity_override_positive",
      sql`${table.capacityOverride} is null or ${table.capacityOverride} > 0`
    ),
    foreignKey({
      name: "sessions_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sessions_template_fk",
      columns: [table.organizationId, table.classTemplateId],
      foreignColumns: [classTemplates.organizationId, classTemplates.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sessions_space_fk",
      columns: [table.organizationId, table.spaceId],
      foreignColumns: [spaces.organizationId, spaces.id],
    }).onDelete("restrict"),
  ]
);

export const sessionStaff = zaltyko.table(
  "session_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull(),
    staffProfileId: uuid("staff_profile_id").notNull(),
    assignmentRole: text("assignment_role").notNull().default("coach"),
  },
  (table) => [
    uniqueIndex("session_staff_uq").on(
      table.organizationId,
      table.sessionId,
      table.staffProfileId
    ),
    foreignKey({
      name: "session_staff_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "session_staff_profile_fk",
      columns: [table.organizationId, table.staffProfileId],
      foreignColumns: [staffProfiles.organizationId, staffProfiles.id],
    }).onDelete("restrict"),
  ]
);

export const pricePlans = zaltyko.table(
  "price_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cadence: billingCadence("cadence").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("price_plans_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    check("price_plans_amount_non_negative", sql`${table.amountCents} >= 0`),
    check("price_plans_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ]
);

export const enrollments = zaltyko.table(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    athleteId: uuid("athlete_id").notNull(),
    classTemplateId: uuid("class_template_id").notNull(),
    pricePlanId: uuid("price_plan_id"),
    status: enrollmentStatus("status").notNull().default("pending"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    source: enrollmentSource("source").notNull(),
    sourceEntityId: uuid("source_entity_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("enrollments_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("enrollments_organization_location_id_uq").on(
      table.organizationId,
      table.locationId,
      table.id
    ),
    uniqueIndex("enrollments_billing_coverage_fk_uq").on(
      table.organizationId,
      table.locationId,
      table.athleteId,
      table.classTemplateId,
      table.id
    ),
    index("enrollments_class_status_idx").on(
      table.organizationId,
      table.classTemplateId,
      table.status
    ),
    index("enrollments_athlete_status_idx").on(
      table.organizationId,
      table.athleteId,
      table.status
    ),
    uniqueIndex("enrollments_open_uq")
      .on(table.organizationId, table.athleteId, table.classTemplateId)
      .where(sql`${table.status} in ('pending', 'trial', 'active', 'paused')`),
    check(
      "enrollments_dates_valid",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`
    ),
    check("enrollments_version_positive", sql`${table.version} > 0`),
    foreignKey({
      name: "enrollments_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "enrollments_athlete_fk",
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "enrollments_template_fk",
      columns: [table.organizationId, table.classTemplateId],
      foreignColumns: [classTemplates.organizationId, classTemplates.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "enrollments_price_plan_fk",
      columns: [table.organizationId, table.pricePlanId],
      foreignColumns: [pricePlans.organizationId, pricePlans.id],
    }).onDelete("restrict"),
  ]
);

export const enrollmentStatusHistory = zaltyko.table(
  "enrollment_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id").notNull(),
    fromStatus: enrollmentStatus("from_status"),
    toStatus: enrollmentStatus("to_status").notNull(),
    reasonCode: text("reason_code"),
    changedByMemberId: uuid("changed_by_member_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    effectiveOn: date("effective_on").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("enrollment_status_history_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    index("enrollment_status_history_enrollment_idx").on(
      table.organizationId,
      table.enrollmentId,
      table.changedAt
    ),
    index("enrollment_status_history_effective_idx").on(
      table.organizationId,
      table.enrollmentId,
      table.effectiveOn,
      table.changedAt
    ),
    foreignKey({
      name: "enrollment_status_history_enrollment_fk",
      columns: [table.organizationId, table.enrollmentId],
      foreignColumns: [enrollments.organizationId, enrollments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "enrollment_status_history_member_fk",
      columns: [table.organizationId, table.changedByMemberId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const enrollmentPauses = zaltyko.table(
  "enrollment_pauses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    reasonCode: text("reason_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("enrollment_pauses_enrollment_idx").on(
      table.organizationId,
      table.enrollmentId
    ),
    uniqueIndex("enrollment_pauses_one_open_uq")
      .on(table.organizationId, table.enrollmentId)
      .where(sql`${table.endsOn} is null`),
    check(
      "enrollment_pauses_dates_valid",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`
    ),
    foreignKey({
      name: "enrollment_pauses_enrollment_fk",
      columns: [table.organizationId, table.enrollmentId],
      foreignColumns: [enrollments.organizationId, enrollments.id],
    }).onDelete("cascade"),
  ]
);

export const attendanceRecords = zaltyko.table(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    enrollmentId: uuid("enrollment_id").notNull(),
    athleteId: uuid("athlete_id").notNull(),
    status: attendanceStatus("status").notNull(),
    recordedByMemberId: uuid("recorded_by_member_id"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_records_session_enrollment_uq").on(
      table.organizationId,
      table.sessionId,
      table.enrollmentId
    ),
    index("attendance_records_athlete_idx").on(
      table.organizationId,
      table.athleteId,
      table.recordedAt
    ),
    foreignKey({
      name: "attendance_records_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "attendance_records_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "attendance_records_enrollment_fk",
      columns: [table.organizationId, table.enrollmentId],
      foreignColumns: [enrollments.organizationId, enrollments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "attendance_records_athlete_fk",
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "attendance_records_member_fk",
      columns: [table.organizationId, table.recordedByMemberId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const trials = zaltyko.table(
  "trials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    athleteId: uuid("athlete_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    trialEnrollmentId: uuid("trial_enrollment_id").notNull(),
    convertedEnrollmentId: uuid("converted_enrollment_id"),
    status: trialStatus("status").notNull().default("booked"),
    version: integer("version").notNull().default(1),
    bookedAt: timestamp("booked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    attendedAt: timestamp("attended_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("trials_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("trials_organization_location_id_uq").on(
      table.organizationId,
      table.locationId,
      table.id
    ),
    uniqueIndex("trials_enrollment_uq").on(
      table.organizationId,
      table.trialEnrollmentId
    ),
    uniqueIndex("trials_athlete_session_uq").on(
      table.organizationId,
      table.athleteId,
      table.sessionId
    ),
    index("trials_location_status_idx").on(
      table.organizationId,
      table.locationId,
      table.status,
      table.bookedAt
    ),
    check("trials_version_positive", sql`${table.version} > 0`),
    foreignKey({
      name: "trials_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "trials_athlete_fk",
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "trials_session_fk",
      columns: [table.organizationId, table.locationId, table.sessionId],
      foreignColumns: [
        sessions.organizationId,
        sessions.locationId,
        sessions.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "trials_trial_enrollment_fk",
      columns: [
        table.organizationId,
        table.locationId,
        table.trialEnrollmentId,
      ],
      foreignColumns: [
        enrollments.organizationId,
        enrollments.locationId,
        enrollments.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "trials_converted_enrollment_fk",
      columns: [
        table.organizationId,
        table.locationId,
        table.convertedEnrollmentId,
      ],
      foreignColumns: [
        enrollments.organizationId,
        enrollments.locationId,
        enrollments.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const trialStatusHistory = zaltyko.table(
  "trial_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    trialId: uuid("trial_id").notNull(),
    fromStatus: trialStatus("from_status"),
    toStatus: trialStatus("to_status").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    changedByMemberId: uuid("changed_by_member_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("trial_status_history_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    index("trial_status_history_trial_idx").on(
      table.organizationId,
      table.trialId,
      table.effectiveAt,
      table.changedAt
    ),
    check(
      "trial_status_history_idempotency_not_blank",
      sql`btrim(${table.idempotencyKey}) <> ''`
    ),
    foreignKey({
      name: "trial_status_history_trial_fk",
      columns: [table.organizationId, table.locationId, table.trialId],
      foreignColumns: [trials.organizationId, trials.locationId, trials.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "trial_status_history_member_fk",
      columns: [table.organizationId, table.changedByMemberId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const trialFollowups = zaltyko.table(
  "trial_followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    trialId: uuid("trial_id").notNull(),
    channel: trialFollowupChannel("channel").notNull(),
    outcome: trialFollowupOutcome("outcome").notNull(),
    completedByMemberId: uuid("completed_by_member_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("trial_followups_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    index("trial_followups_trial_completed_idx").on(
      table.organizationId,
      table.trialId,
      table.completedAt
    ),
    check(
      "trial_followups_idempotency_not_blank",
      sql`btrim(${table.idempotencyKey}) <> ''`
    ),
    foreignKey({
      name: "trial_followups_trial_fk",
      columns: [table.organizationId, table.locationId, table.trialId],
      foreignColumns: [trials.organizationId, trials.locationId, trials.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "trial_followups_member_fk",
      columns: [table.organizationId, table.completedByMemberId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const waitlistEntries = zaltyko.table(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    athleteId: uuid("athlete_id").notNull(),
    classTemplateId: uuid("class_template_id"),
    programId: uuid("program_id"),
    sourceTrialId: uuid("source_trial_id"),
    contactGuardianId: uuid("contact_guardian_id"),
    contactable: boolean("contactable").notNull().default(false),
    contactConsentStatus: contactConsentStatus("contact_consent_status")
      .notNull()
      .default("unknown"),
    contactConsentRecordedAt: timestamp("contact_consent_recorded_at", {
      withTimezone: true,
    }),
    priority: integer("priority").notNull().default(0),
    preferences: jsonb("preferences")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: waitlistStatus("status").notNull().default("waiting"),
    convertedEnrollmentId: uuid("converted_enrollment_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("waitlist_entries_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("waitlist_entries_organization_location_id_uq").on(
      table.organizationId,
      table.locationId,
      table.id
    ),
    uniqueIndex("waitlist_entries_open_template_uq")
      .on(table.organizationId, table.athleteId, table.classTemplateId)
      .where(
        sql`${table.classTemplateId} is not null and ${table.status} in ('waiting', 'offered')`
      ),
    uniqueIndex("waitlist_entries_open_program_uq")
      .on(
        table.organizationId,
        table.locationId,
        table.athleteId,
        table.programId
      )
      .where(
        sql`${table.programId} is not null and ${table.status} in ('waiting', 'offered')`
      ),
    index("waitlist_entries_actionable_idx").on(
      table.organizationId,
      table.locationId,
      table.status,
      table.contactable,
      table.priority,
      table.joinedAt
    ),
    check(
      "waitlist_entries_target_required",
      sql`(${table.classTemplateId} is not null and ${table.programId} is null) or (${table.classTemplateId} is null and ${table.programId} is not null)`
    ),
    check(
      "waitlist_entries_contactable_valid",
      sql`not ${table.contactable} or (${table.contactGuardianId} is not null and ${table.contactConsentStatus} = 'granted')`
    ),
    check(
      "waitlist_entries_consent_timestamp_valid",
      sql`${table.contactConsentStatus} = 'unknown' or ${table.contactConsentRecordedAt} is not null`
    ),
    check("waitlist_entries_priority_valid", sql`${table.priority} >= 0`),
    check(
      "waitlist_entries_preferences_object",
      sql`jsonb_typeof(${table.preferences}) = 'object'`
    ),
    check("waitlist_entries_version_positive", sql`${table.version} > 0`),
    foreignKey({
      name: "waitlist_entries_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "waitlist_entries_athlete_fk",
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "waitlist_entries_template_fk",
      columns: [table.organizationId, table.locationId, table.classTemplateId],
      foreignColumns: [
        classTemplates.organizationId,
        classTemplates.locationId,
        classTemplates.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "waitlist_entries_program_fk",
      columns: [table.organizationId, table.programId],
      foreignColumns: [programs.organizationId, programs.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "waitlist_entries_source_trial_fk",
      columns: [table.organizationId, table.locationId, table.sourceTrialId],
      foreignColumns: [trials.organizationId, trials.locationId, trials.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "waitlist_entries_contact_guardian_fk",
      columns: [table.organizationId, table.contactGuardianId],
      foreignColumns: [guardians.organizationId, guardians.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "waitlist_entries_converted_enrollment_fk",
      columns: [
        table.organizationId,
        table.locationId,
        table.convertedEnrollmentId,
      ],
      foreignColumns: [
        enrollments.organizationId,
        enrollments.locationId,
        enrollments.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const waitlistOffers = zaltyko.table(
  "waitlist_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    waitlistEntryId: uuid("waitlist_entry_id").notNull(),
    classTemplateId: uuid("class_template_id").notNull(),
    reservedEnrollmentId: uuid("reserved_enrollment_id").notNull(),
    status: waitlistOfferStatus("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("waitlist_offers_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("waitlist_offers_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("waitlist_offers_one_pending_uq")
      .on(table.organizationId, table.waitlistEntryId)
      .where(sql`${table.status} = 'pending'`),
    index("waitlist_offers_expiry_idx").on(
      table.organizationId,
      table.status,
      table.expiresAt
    ),
    check(
      "waitlist_offers_dates_valid",
      sql`${table.expiresAt} > ${table.sentAt}`
    ),
    check(
      "waitlist_offers_idempotency_not_blank",
      sql`btrim(${table.idempotencyKey}) <> ''`
    ),
    check("waitlist_offers_version_positive", sql`${table.version} > 0`),
    foreignKey({
      name: "waitlist_offers_entry_fk",
      columns: [table.organizationId, table.locationId, table.waitlistEntryId],
      foreignColumns: [
        waitlistEntries.organizationId,
        waitlistEntries.locationId,
        waitlistEntries.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "waitlist_offers_template_fk",
      columns: [table.organizationId, table.locationId, table.classTemplateId],
      foreignColumns: [
        classTemplates.organizationId,
        classTemplates.locationId,
        classTemplates.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "waitlist_offers_enrollment_fk",
      columns: [
        table.organizationId,
        table.locationId,
        table.reservedEnrollmentId,
      ],
      foreignColumns: [
        enrollments.organizationId,
        enrollments.locationId,
        enrollments.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const outboxEvents = zaltyko.table(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id"),
    eventName: text("event_name").notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("outbox_events_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("outbox_events_idempotency_uq").on(
      table.organizationId,
      table.eventName,
      table.idempotencyKey
    ),
    index("outbox_events_dispatch_idx").on(table.status, table.availableAt),
    index("outbox_events_unsettled_freshness_idx")
      .on(table.organizationId, table.locationId, table.occurredAt)
      .where(sql`${table.status} in ('pending', 'processing', 'failed')`),
    check("outbox_events_version_positive", sql`${table.eventVersion} > 0`),
    check("outbox_events_attempts_non_negative", sql`${table.attempts} >= 0`),
    foreignKey({
      name: "outbox_events_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
  ]
);

export const auditLog = zaltyko.table(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    locationId: uuid("location_id"),
    actorUserId: uuid("actor_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    requestId: text("request_id"),
    idempotencyKey: text("idempotency_key"),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_log_target_idx").on(
      table.organizationId,
      table.targetType,
      table.targetId
    ),
    index("audit_log_created_idx").on(table.organizationId, table.createdAt),
    uniqueIndex("audit_log_idempotency_uq")
      .on(table.organizationId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    foreignKey({
      name: "audit_log_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
  ]
);

export const ownerDashboardLayouts = zaltyko.table(
  "owner_dashboard_layouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    moduleOrder: text("module_order").array().notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("owner_dashboard_layouts_organization_user_uq").on(
      table.organizationId,
      table.userId
    ),
    check(
      "owner_dashboard_layouts_order_cardinality",
      sql`cardinality(${table.moduleOrder}) = 4`
    ),
    check(
      "owner_dashboard_layouts_version_positive",
      sql`${table.version} > 0`
    ),
  ]
);

export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Athlete = typeof athletes.$inferSelect;
export type Family = typeof families.$inferSelect;
export type Guardian = typeof guardians.$inferSelect;
export type GroupMembership = typeof groupMemberships.$inferSelect;
export type GroupMembershipHistory = typeof groupMembershipHistory.$inferSelect;
export type ClassTemplate = typeof classTemplates.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type Trial = typeof trials.$inferSelect;
export type TrialFollowup = typeof trialFollowups.$inferSelect;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type WaitlistOffer = typeof waitlistOffers.$inferSelect;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
