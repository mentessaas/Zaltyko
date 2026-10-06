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

export const organizations = zaltyko.table(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    status: organizationStatus("status").notNull().default("trial"),
    countryCode: text("country_code").notNull().default("ES"),
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
    check("organizations_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check(
      "organizations_country_code_format",
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`
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

export const programs = zaltyko.table(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    discipline: text("discipline").notNull(),
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
    uniqueIndex("outbox_events_idempotency_uq").on(
      table.organizationId,
      table.eventName,
      table.idempotencyKey
    ),
    index("outbox_events_dispatch_idx").on(table.status, table.availableAt),
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

export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Athlete = typeof athletes.$inferSelect;
export type GroupMembership = typeof groupMemberships.$inferSelect;
export type ClassTemplate = typeof classTemplates.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
