import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  entitlementSource,
  organizations,
  organizationMembers,
  saasBillingInterval,
  saasPlanCode,
  stripeEnvironment,
} from "./zaltyko-core";
import { authUsers } from "./auth-users";

const zaltyko = pgSchema("zaltyko");

export const organizationSaasTrialStatus = zaltyko.enum(
  "organization_saas_trial_status",
  ["active", "expired", "converted", "cancelled"]
);

/** Server-only Stripe Customer reference for a Zaltyko organization. */
export const organizationSaasCustomers = zaltyko.table(
  "organization_saas_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("stripe"),
    environment: stripeEnvironment("environment").notNull(),
    providerAccountReference: text("provider_account_reference").notNull(),
    customerReference: text("customer_reference"),
    status: text("status").notNull().default("creating"),
    creationIdempotencyKey: text("creation_idempotency_key").notNull(),
    creationRequestHash: text("creation_request_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_saas_customers_org_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("organization_saas_customers_one_per_env_uq").on(
      table.organizationId,
      table.environment
    ),
    uniqueIndex("organization_saas_customers_provider_id_uq").on(
      table.environment,
      table.providerAccountReference,
      table.customerReference
    ),
    uniqueIndex("organization_saas_customers_subscription_fk_key_uq").on(
      table.organizationId,
      table.environment,
      table.providerAccountReference,
      table.customerReference
    ),
    uniqueIndex("organization_saas_customers_operation_fk_key_uq").on(
      table.organizationId,
      table.id,
      table.environment,
      table.providerAccountReference
    ),
    uniqueIndex("organization_saas_customers_idempotency_uq").on(
      table.organizationId,
      table.environment,
      table.creationIdempotencyKey
    ),
    check(
      "organization_saas_customers_provider_valid",
      sql`${table.provider} = 'stripe'`
    ),
    check(
      "organization_saas_customers_provider_account_not_blank",
      sql`btrim(${table.providerAccountReference}) <> ''`
    ),
    check(
      "organization_saas_customers_idempotency_not_blank",
      sql`btrim(${table.creationIdempotencyKey}) <> ''`
    ),
    check(
      "organization_saas_customers_request_hash_format",
      sql`${table.creationRequestHash} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "organization_saas_customers_attempts_nonnegative",
      sql`${table.attempts} >= 0`
    ),
    check(
      "organization_saas_customers_reference_not_blank",
      sql`${table.customerReference} is null or btrim(${table.customerReference}) <> ''`
    ),
    check(
      "organization_saas_customers_state_valid",
      sql`(${table.status} = 'creating' and ${table.customerReference} is null) or (${table.status} = 'ready' and ${table.customerReference} is not null) or ${table.status} = 'recovery_required'`
    ),
    check(
      "organization_saas_customers_status_valid",
      sql`${table.status} in ('creating', 'ready', 'recovery_required')`
    ),
  ]
);

/** Durable idempotent Checkout reservations and recovery fencing. */
export const organizationSaasCheckoutOperations = zaltyko.table(
  "organization_saas_checkout_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestedByMemberId: uuid("requested_by_member_id").notNull(),
    environment: stripeEnvironment("environment").notNull(),
    providerAccountReference: text("provider_account_reference").notNull(),
    customerId: uuid("customer_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    planCode: saasPlanCode("plan_code").notNull(),
    billingInterval: saasBillingInterval("billing_interval").notNull(),
    status: text("status").notNull().default("requested"),
    stripeIdempotencyKey: text("stripe_idempotency_key").notNull(),
    checkoutSessionReference: text("checkout_session_reference"),
    sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    fencingVersion: bigint("fencing_version", { mode: "number" })
      .notNull()
      .default(0),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("organization_saas_checkout_operations_org_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("organization_saas_checkout_operations_idempotency_uq").on(
      table.organizationId,
      table.environment,
      table.idempotencyKey
    ),
    uniqueIndex("organization_saas_checkout_operations_stripe_key_uq").on(
      table.stripeIdempotencyKey
    ),
    uniqueIndex("organization_saas_checkout_operations_provider_session_uq").on(
      table.environment,
      table.providerAccountReference,
      table.checkoutSessionReference
    ),
    uniqueIndex("organization_saas_checkout_one_pending_per_org_uq")
      .on(table.organizationId)
      .where(
        sql`${table.status} in ('requested', 'creating_customer', 'creating_session', 'open', 'recovery_required')`
      ),
    index("organization_saas_checkout_recovery_idx")
      .on(table.status, table.updatedAt)
      .where(sql`${table.status} in ('creating_customer', 'creating_session', 'recovery_required')`),
    foreignKey({
      name: "organization_saas_checkout_operations_owner_fk",
      columns: [table.organizationId, table.requestedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "organization_saas_checkout_operations_customer_fk",
      columns: [
        table.organizationId,
        table.customerId,
        table.environment,
        table.providerAccountReference,
      ],
      foreignColumns: [
        organizationSaasCustomers.organizationId,
        organizationSaasCustomers.id,
        organizationSaasCustomers.environment,
        organizationSaasCustomers.providerAccountReference,
      ],
    }).onDelete("restrict"),
    check(
      "organization_saas_checkout_operations_idempotency_length",
      sql`length(btrim(${table.idempotencyKey})) between 8 and 150`
    ),
    check(
      "organization_saas_checkout_operations_hash_format",
      sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "organization_saas_checkout_operations_plan_self_serve",
      sql`${table.planCode} in ('starter', 'growth')`
    ),
    check(
      "organization_saas_checkout_operations_account_not_blank",
      sql`btrim(${table.providerAccountReference}) <> ''`
    ),
    check(
      "organization_saas_checkout_operations_stripe_key_not_blank",
      sql`btrim(${table.stripeIdempotencyKey}) <> ''`
    ),
    check(
      "organization_saas_checkout_operations_attempts_nonnegative",
      sql`${table.attempts} >= 0 and ${table.fencingVersion} >= 0`
    ),
    check(
      "organization_saas_checkout_operations_status_valid",
      sql`${table.status} in ('requested', 'creating_customer', 'creating_session', 'open', 'completed', 'failed', 'expired', 'recovery_required')`
    ),
    check(
      "organization_saas_checkout_operations_session_ref_pair",
      sql`(${table.checkoutSessionReference} is null) = (${table.sessionExpiresAt} is null)`
    ),
    check(
      "organization_saas_checkout_operations_session_ref_not_blank",
      sql`${table.checkoutSessionReference} is null or btrim(${table.checkoutSessionReference}) <> ''`
    ),
    check(
      "organization_saas_checkout_operations_session_state_valid",
      sql`(${table.status} in ('open', 'completed', 'expired') and ${table.checkoutSessionReference} is not null and ${table.sessionExpiresAt} is not null) or (${table.status} in ('requested', 'creating_customer', 'creating_session', 'failed') and ${table.checkoutSessionReference} is null and ${table.sessionExpiresAt} is null) or ${table.status} = 'recovery_required'`
    ),
    check(
      "organization_saas_checkout_operations_lease_valid",
      sql`(${table.status} in ('creating_customer', 'creating_session') and ${table.leaseToken} is not null and ${table.leaseUntil} is not null) or (${table.status} not in ('creating_customer', 'creating_session') and ${table.leaseToken} is null and ${table.leaseUntil} is null)`
    ),
    check(
      "organization_saas_checkout_operations_completion_valid",
      sql`(${table.status} = 'completed' and ${table.completedAt} is not null and ${table.completedAt} >= ${table.createdAt}) or (${table.status} <> 'completed' and ${table.completedAt} is null)`
    ),
  ]
);

/** One explicitly activated seven-day Starter trial per cooldown window. */
export const organizationSaasTrials = zaltyko.table(
  "organization_saas_trials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    startedByMemberId: uuid("started_by_member_id").notNull(),
    status: organizationSaasTrialStatus("status").notNull().default("active"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    cooldownEndsAt: timestamp("cooldown_ends_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_saas_trials_org_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("organization_saas_trials_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("organization_saas_trials_one_active_uq")
      .on(table.organizationId)
      .where(sql`${table.status} = 'active'`),
    index("organization_saas_trials_cooldown_idx").on(
      table.organizationId,
      table.startedAt
    ),
    foreignKey({
      name: "organization_saas_trials_starter_fk",
      columns: [table.organizationId, table.startedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }).onDelete("restrict"),
    check(
      "organization_saas_trials_idempotency_length",
      sql`length(btrim(${table.idempotencyKey})) between 8 and 150`
    ),
    check(
      "organization_saas_trials_hash_format",
      sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "organization_saas_trials_end_state_valid",
      sql`(${table.status} = 'active' and ${table.endedAt} is null and ${table.convertedAt} is null) or (${table.status} = 'converted' and ${table.endedAt} is not null and ${table.convertedAt} is not null) or (${table.status} in ('expired', 'cancelled') and ${table.endedAt} is not null and ${table.convertedAt} is null)`
    ),
    check(
      "organization_saas_trials_ended_after_start",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`
    ),
    check(
      "organization_saas_trials_converted_after_start",
      sql`${table.convertedAt} is null or ${table.convertedAt} >= ${table.startedAt}`
    ),
    check(
      "organization_saas_trials_periods_valid",
      sql`${table.endsAt} > ${table.startedAt} and ${table.cooldownEndsAt} > ${table.startedAt}`
    ),
  ]
);

/** Server-owned current projection of the commercial Stripe subscription. */
export const organizationSaasSubscriptions = zaltyko.table(
  "organization_saas_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("stripe"),
    environment: stripeEnvironment("environment").notNull(),
    providerAccountReference: text("provider_account_reference").notNull(),
    customerReference: text("customer_reference").notNull(),
    subscriptionReference: text("subscription_reference").notNull(),
    priceReference: text("price_reference").notNull(),
    planCode: saasPlanCode("plan_code").notNull(),
    providerStatus: text("provider_status").notNull(),
    billingInterval: saasBillingInterval("billing_interval").notNull(),
    currentPeriodStartedAt: timestamp("current_period_started_at", {
      withTimezone: true,
    }).notNull(),
    currentPeriodEndsAt: timestamp("current_period_ends_at", {
      withTimezone: true,
    }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    lastProviderEventReference: text("last_provider_event_reference"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_saas_subscriptions_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("organization_saas_subscriptions_organization_uq").on(
      table.organizationId
    ),
    uniqueIndex("organization_saas_subscriptions_provider_reference_uq").on(
      table.environment,
      table.providerAccountReference,
      table.subscriptionReference
    ),
    index("organization_saas_subscriptions_status_idx").on(
      table.organizationId,
      table.providerStatus,
      table.currentPeriodEndsAt
    ),
    foreignKey({
      name: "organization_saas_subscriptions_customer_fk",
      columns: [
        table.organizationId,
        table.environment,
        table.providerAccountReference,
        table.customerReference,
      ],
      foreignColumns: [
        organizationSaasCustomers.organizationId,
        organizationSaasCustomers.environment,
        organizationSaasCustomers.providerAccountReference,
        organizationSaasCustomers.customerReference,
      ],
    }).onDelete("restrict"),
    check(
      "organization_saas_subscriptions_provider_stripe",
      sql`${table.provider} = 'stripe'`
    ),
    check(
      "organization_saas_subscriptions_references_not_blank",
      sql`btrim(${table.providerAccountReference}) <> '' and btrim(${table.customerReference}) <> '' and btrim(${table.subscriptionReference}) <> '' and btrim(${table.priceReference}) <> ''`
    ),
    check(
      "organization_saas_subscriptions_plan_paid",
      sql`${table.planCode} in ('starter', 'growth', 'network')`
    ),
    check(
      "organization_saas_subscriptions_provider_status_valid",
      sql`${table.providerStatus} in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')`
    ),
    check(
      "organization_saas_subscriptions_period_valid",
      sql`${table.currentPeriodEndsAt} > ${table.currentPeriodStartedAt}`
    ),
  ]
);

export const organizationEntitlements = zaltyko.table(
  "organization_entitlements",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planCode: saasPlanCode("plan_code").notNull(),
    revision: integer("revision").notNull().default(1),
    source: entitlementSource("source").notNull(),
    sourceReference: text("source_reference").notNull(),
    subscriptionId: uuid("subscription_id"),
    trialId: uuid("trial_id"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "organization_entitlements_revision_positive",
      sql`${table.revision} > 0`
    ),
    check(
      "organization_entitlements_source_reference_not_blank",
      sql`btrim(${table.sourceReference}) <> ''`
    ),
    check(
      "organization_entitlements_period_valid",
      sql`${table.effectiveUntil} is null or ${table.effectiveUntil} > ${table.effectiveFrom}`
    ),
    check(
      "organization_entitlements_source_valid",
      sql`(${table.source} = 'bootstrap' and ${table.planCode} = 'free' and ${table.subscriptionId} is null and ${table.trialId} is null) or (${table.source} = 'stripe_subscription' and ${table.planCode} <> 'free' and ${table.subscriptionId} is not null and ${table.trialId} is null) or (${table.source} = 'contract' and ${table.subscriptionId} is null and ${table.trialId} is null) or (${table.source} = 'trial' and ${table.planCode} = 'starter' and ${table.subscriptionId} is null and ${table.trialId} is not null) or (${table.source} = 'trial_expired' and ${table.planCode} = 'free' and ${table.subscriptionId} is null and ${table.trialId} is not null)`
    ),
    foreignKey({
      name: "organization_entitlements_subscription_fk",
      columns: [table.organizationId, table.subscriptionId],
      foreignColumns: [
        organizationSaasSubscriptions.organizationId,
        organizationSaasSubscriptions.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "organization_entitlements_trial_fk",
      columns: [table.organizationId, table.trialId],
      foreignColumns: [organizationSaasTrials.organizationId, organizationSaasTrials.id],
    }).onDelete("restrict"),
  ]
);

export const organizationEntitlementChanges = zaltyko.table(
  "organization_entitlement_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    planCode: saasPlanCode("plan_code").notNull(),
    source: entitlementSource("source").notNull(),
    sourceReference: text("source_reference").notNull(),
    subscriptionId: uuid("subscription_id"),
    trialId: uuid("trial_id"),
    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
    }).notNull(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_entitlement_changes_revision_uq").on(
      table.organizationId,
      table.revision
    ),
    uniqueIndex("organization_entitlement_changes_snapshot_uq").on(
      table.organizationId,
      table.id
    ),
    index("organization_entitlement_changes_history_idx").on(
      table.organizationId,
      table.revision
    ),
    check(
      "organization_entitlement_changes_revision_positive",
      sql`${table.revision} > 0`
    ),
    check(
      "organization_entitlement_changes_source_reference_not_blank",
      sql`btrim(${table.sourceReference}) <> ''`
    ),
    check(
      "organization_entitlement_changes_period_valid",
      sql`${table.effectiveUntil} is null or ${table.effectiveUntil} > ${table.effectiveFrom}`
    ),
    check(
      "organization_entitlement_changes_source_valid",
      sql`(${table.source} = 'bootstrap' and ${table.planCode} = 'free' and ${table.subscriptionId} is null and ${table.trialId} is null) or (${table.source} = 'stripe_subscription' and ${table.planCode} <> 'free' and ${table.subscriptionId} is not null and ${table.trialId} is null) or (${table.source} = 'contract' and ${table.subscriptionId} is null and ${table.trialId} is null) or (${table.source} = 'trial' and ${table.planCode} = 'starter' and ${table.subscriptionId} is null and ${table.trialId} is not null) or (${table.source} = 'trial_expired' and ${table.planCode} = 'free' and ${table.subscriptionId} is null and ${table.trialId} is not null)`
    ),
    foreignKey({
      name: "organization_entitlement_changes_subscription_fk",
      columns: [table.organizationId, table.subscriptionId],
      foreignColumns: [
        organizationSaasSubscriptions.organizationId,
        organizationSaasSubscriptions.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "organization_entitlement_changes_trial_fk",
      columns: [table.organizationId, table.trialId],
      foreignColumns: [organizationSaasTrials.organizationId, organizationSaasTrials.id],
    }).onDelete("restrict"),
  ]
);

/** Verified SaaS platform webhook inbox; payload content is never retained. */
export const organizationSaasWebhookEvents = zaltyko.table(
  "organization_saas_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull().default("stripe"),
    providerAccountReference: text("provider_account_reference").notNull(),
    environment: stripeEnvironment("environment").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventAccountReference: text("event_account_reference"),
    eventType: text("event_type").notNull(),
    eventCreatedAt: timestamp("event_created_at", { withTimezone: true }),
    providerObjectType: text("provider_object_type"),
    providerObjectReference: text("provider_object_reference"),
    livemode: boolean("livemode").notNull(),
    signatureVerified: boolean("signature_verified").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("received"),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    fencingVersion: bigint("fencing_version", { mode: "number" })
      .notNull()
      .default(0),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    // The circular decision FK and deferred orphan guard are migration-only.
    reconciliationDecisionId: uuid("reconciliation_decision_id"),
    reconciliationNextAttemptAt: timestamp("reconciliation_next_attempt_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex("organization_saas_webhook_events_org_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("organization_saas_webhook_event_uq").on(
      table.providerAccountReference,
      table.environment,
      table.providerEventId
    ),
    index("organization_saas_webhook_events_queue_idx")
      .on(table.status, table.receivedAt)
      .where(sql`${table.status} in ('received', 'failed')`),
    index("organization_saas_webhook_events_org_idx")
      .on(table.organizationId, table.receivedAt)
      .where(sql`${table.organizationId} is not null`),
    index("saas_webhook_reconciliation_queue_idx")
      .on(table.reconciliationNextAttemptAt, table.receivedAt)
      .where(
        sql`${table.reconciliationDecisionId} is not null and ${table.status} in ('received', 'failed')`
      ),
    check(
      "organization_saas_webhook_provider_stripe",
      sql`${table.provider} = 'stripe'`
    ),
    check(
      "organization_saas_webhook_event_strings_not_blank",
      sql`btrim(${table.providerAccountReference}) <> '' and btrim(${table.providerEventId}) <> '' and btrim(${table.eventType}) <> ''`
    ),
    check(
      "organization_saas_webhook_mode_valid",
      sql`(${table.environment} = 'live' and ${table.livemode}) or (${table.environment} = 'test' and not ${table.livemode})`
    ),
    check(
      "organization_saas_webhook_signature_verified",
      sql`${table.signatureVerified}`
    ),
    check(
      "organization_saas_webhook_hash_format",
      sql`${table.payloadSha256} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "organization_saas_webhook_status_valid",
      sql`${table.status} in ('received', 'processing', 'processed', 'failed', 'quarantined', 'ignored')`
    ),
    check(
      "organization_saas_webhook_attempts_nonnegative",
      sql`${table.attempts} >= 0 and ${table.fencingVersion} >= 0`
    ),
    check(
      "organization_saas_webhook_lease_valid",
      sql`(${table.status} = 'processing' and ${table.leaseToken} is not null and ${table.leaseUntil} is not null and ${table.fencingVersion} > 0) or (${table.status} <> 'processing' and ${table.leaseToken} is null and ${table.leaseUntil} is null)`
    ),
    check(
      "organization_saas_webhook_processed_valid",
      sql`(${table.status} in ('processed', 'ignored') and ${table.processedAt} is not null) or (${table.status} not in ('processed', 'ignored') and ${table.processedAt} is null)`
    ),
    check(
      "organization_saas_webhook_event_account_not_blank",
      sql`${table.eventAccountReference} is null or btrim(${table.eventAccountReference}) <> ''`
    ),
    check(
      "organization_saas_webhook_event_object_not_blank",
      sql`${table.providerObjectReference} is null or btrim(${table.providerObjectReference}) <> ''`
    ),
    check(
      "organization_saas_webhook_event_object_type_not_blank",
      sql`${table.providerObjectType} is null or btrim(${table.providerObjectType}) <> ''`
    ),
    check(
      "saas_webhook_reconciliation_retry_requires_decision",
      sql`${table.reconciliationNextAttemptAt} is null or (${table.reconciliationDecisionId} is not null and ${table.status} in ('received', 'failed'))`
    ),
    check(
      "saas_webhook_event_reconciliation_org_check",
      sql`${table.reconciliationDecisionId} is null or ${table.organizationId} is not null`
    ),
  ]
);

export const organizationSaasWebhookPayloadConflicts = zaltyko.table(
  "organization_saas_webhook_payload_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookEventId: uuid("webhook_event_id")
      .notNull()
      .references(() => organizationSaasWebhookEvents.id, { onDelete: "restrict" }),
    observedPayloadSha256: text("observed_payload_sha256").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    occurrences: integer("occurrences").notNull().default(1),
  },
  (table) => [
    uniqueIndex("organization_saas_webhook_payload_conflict_uq").on(
      table.webhookEventId,
      table.observedPayloadSha256
    ),
    check(
      "organization_saas_webhook_payload_conflict_hash_format",
      sql`${table.observedPayloadSha256} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "organization_saas_webhook_payload_conflict_occurrences_positive",
      sql`${table.occurrences} > 0`
    ),
    check(
      "organization_saas_webhook_payload_conflict_times_valid",
      sql`${table.lastSeenAt} >= ${table.firstSeenAt}`
    ),
  ]
);

/** Immutable operator authorization for a single quarantined SaaS event. */
export const organizationSaasWebhookReconciliationDecisions = zaltyko.table(
  "organization_saas_webhook_reconciliation_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    webhookEventId: uuid("webhook_event_id").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    requestId: text("request_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    confirmationRequestSha256: text("confirmation_request_sha256").notNull(),
    resolutionKind: text("resolution_kind").notNull(),
    reason: text("reason").notNull(),
    providerAccountReference: text("provider_account_reference").notNull(),
    environment: stripeEnvironment("environment").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventCreatedAt: timestamp("event_created_at", { withTimezone: true }).notNull(),
    providerObjectReference: text("provider_object_reference").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    previewTokenSha256: text("preview_token_sha256").notNull(),
    previewIssuedAt: timestamp("preview_issued_at", { withTimezone: true }).notNull(),
    previewExpiresAt: timestamp("preview_expires_at", { withTimezone: true }).notNull(),
    expectedFencingVersion: bigint("expected_fencing_version", { mode: "number" }).notNull(),
    expectedLastProviderEventReference: text("expected_last_provider_event_reference"),
    expectedSubscriptionUpdatedAt: timestamp("expected_subscription_updated_at", { withTimezone: true }).notNull(),
    expectedSubscriptionPlanCode: saasPlanCode("expected_subscription_plan_code").notNull(),
    expectedSubscriptionPriceReference: text("expected_subscription_price_reference").notNull(),
    expectedSubscriptionBillingInterval: saasBillingInterval("expected_subscription_billing_interval").notNull(),
    expectedSubscriptionProviderStatus: text("expected_subscription_provider_status").notNull(),
    expectedSubscriptionCancelAtPeriodEnd: boolean("expected_subscription_cancel_at_period_end").notNull(),
    expectedSubscriptionCanceledAt: timestamp("expected_subscription_canceled_at", { withTimezone: true }),
    expectedSubscriptionPeriodStartedAt: timestamp("expected_subscription_period_started_at", { withTimezone: true }).notNull(),
    expectedSubscriptionPeriodEndsAt: timestamp("expected_subscription_period_ends_at", { withTimezone: true }).notNull(),
    expectedEntitlementRevision: integer("expected_entitlement_revision").notNull(),
    expectedEntitlementPlanCode: saasPlanCode("expected_entitlement_plan_code").notNull(),
    expectedEntitlementSource: entitlementSource("expected_entitlement_source").notNull(),
    expectedEntitlementSourceReference: text("expected_entitlement_source_reference").notNull(),
    expectedEntitlementSubscriptionId: uuid("expected_entitlement_subscription_id"),
    expectedEntitlementTrialId: uuid("expected_entitlement_trial_id"),
    expectedEntitlementEffectiveFrom: timestamp("expected_entitlement_effective_from", { withTimezone: true }).notNull(),
    expectedEntitlementEffectiveUntil: timestamp("expected_entitlement_effective_until", { withTimezone: true }),
    evidenceObservedAt: timestamp("evidence_observed_at", { withTimezone: true }).notNull(),
    executionExpiresAt: timestamp("execution_expires_at", { withTimezone: true }).notNull(),
    snapshotSha256: text("snapshot_sha256").notNull(),
    observedSubscriptionReference: text("observed_subscription_reference").notNull(),
    observedCustomerReference: text("observed_customer_reference").notNull(),
    observedPlanCode: saasPlanCode("observed_plan_code").notNull(),
    observedProviderStatus: text("observed_provider_status").notNull(),
    observedCancelAtPeriodEnd: boolean("observed_cancel_at_period_end").notNull(),
    observedCanceledAt: timestamp("observed_canceled_at", { withTimezone: true }),
    observedCurrentPeriodStartedAt: timestamp("observed_current_period_started_at", { withTimezone: true }).notNull(),
    observedCurrentPeriodEndsAt: timestamp("observed_current_period_ends_at", { withTimezone: true }).notNull(),
    observedPriceReference: text("observed_price_reference").notNull(),
    observedLatestInvoiceReference: text("observed_latest_invoice_reference"),
    invoiceReference: text("invoice_reference"),
    invoiceStatus: text("invoice_status"),
    invoiceCustomerReference: text("invoice_customer_reference"),
    invoiceSubscriptionReference: text("invoice_subscription_reference"),
    invoiceCurrency: text("invoice_currency"),
    invoicePaidAmount: bigint("invoice_paid_amount", { mode: "number" }),
    invoicePeriodStartedAt: timestamp("invoice_period_started_at", { withTimezone: true }),
    invoicePeriodEndsAt: timestamp("invoice_period_ends_at", { withTimezone: true }),
    invoicePriceReference: text("invoice_price_reference"),
    invoicePlanCode: saasPlanCode("invoice_plan_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("saas_webhook_reconciliation_identity_uq").on(
      table.organizationId,
      table.webhookEventId,
      table.id
    ),
    uniqueIndex("saas_webhook_reconciliation_idempotency_uq").on(
      table.webhookEventId,
      table.idempotencyKey
    ),
    index("saas_webhook_reconciliation_event_idx").on(
      table.organizationId,
      table.webhookEventId,
      table.createdAt
    ),
    foreignKey({
      name: "saas_webhook_reconciliation_event_fk",
      columns: [table.organizationId, table.webhookEventId],
      foreignColumns: [organizationSaasWebhookEvents.organizationId, organizationSaasWebhookEvents.id],
    }).onDelete("restrict"),
    check("saas_webhook_reconciliation_idempotency_length", sql`length(btrim(${table.idempotencyKey})) between 8 and 150`),
    check("saas_webhook_reconciliation_hash_format", sql`${table.confirmationRequestSha256} ~ '^[a-f0-9]{64}$' and ${table.payloadSha256} ~ '^[a-f0-9]{64}$' and ${table.previewTokenSha256} ~ '^[a-f0-9]{64}$' and ${table.snapshotSha256} ~ '^[a-f0-9]{64}$'`),
    check("saas_webhook_reconciliation_preview_ttl", sql`${table.previewExpiresAt} > ${table.previewIssuedAt} and ${table.previewExpiresAt} <= ${table.previewIssuedAt} + interval '5 minutes' and ${table.createdAt} < ${table.previewExpiresAt}`),
    check("saas_webhook_reconciliation_execution_ttl", sql`${table.executionExpiresAt} > ${table.evidenceObservedAt} and ${table.executionExpiresAt} <= ${table.evidenceObservedAt} + interval '2 minutes'`),
    check("saas_webhook_reconciliation_periods_valid", sql`${table.observedCurrentPeriodEndsAt} > ${table.observedCurrentPeriodStartedAt} and ${table.expectedSubscriptionPeriodEndsAt} > ${table.expectedSubscriptionPeriodStartedAt}`),
    check("saas_webhook_reconciliation_invoice_shape", sql`(((${table.resolutionKind} = 'status_snapshot' and ${table.invoiceReference} is null and ${table.invoiceStatus} is null and ${table.invoiceCustomerReference} is null and ${table.invoiceSubscriptionReference} is null and ${table.invoiceCurrency} is null and ${table.invoicePaidAmount} is null and ${table.invoicePeriodStartedAt} is null and ${table.invoicePeriodEndsAt} is null and ${table.invoicePriceReference} is null and ${table.invoicePlanCode} is null) or (${table.resolutionKind} = 'status_snapshot' and ${table.invoiceReference} is not null and ${table.invoiceStatus} is not null and ${table.invoiceCustomerReference} = ${table.observedCustomerReference} and ${table.invoiceSubscriptionReference} = ${table.observedSubscriptionReference} and ${table.invoiceCurrency} is null and ${table.invoicePaidAmount} is null and ${table.invoicePeriodStartedAt} is null and ${table.invoicePeriodEndsAt} is null and ${table.invoicePriceReference} is null and ${table.invoicePlanCode} is null) or (${table.resolutionKind} = 'paid_invoice_grant' and ${table.invoiceReference} is not null and ${table.invoiceStatus} = 'paid' and ${table.invoiceCustomerReference} = ${table.observedCustomerReference} and ${table.invoiceSubscriptionReference} = ${table.observedSubscriptionReference} and ${table.invoiceCurrency} = 'eur' and ${table.invoicePaidAmount} >= 0 and ${table.invoicePeriodStartedAt} is not null and ${table.invoicePeriodEndsAt} > ${table.invoicePeriodStartedAt} and ${table.invoicePriceReference} is not null and ${table.invoicePlanCode} in ('starter', 'growth'))) is true`),
  ]
);

/** Append-only evidence of a single consumed reconciliation decision. */
export const organizationSaasWebhookReconciliationResults = zaltyko.table(
  "organization_saas_webhook_reconciliation_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    decisionId: uuid("decision_id").notNull().references(
      () => organizationSaasWebhookReconciliationDecisions.id,
      { onDelete: "restrict" }
    ),
    outcome: text("outcome").notNull(),
    processorFencingVersion: bigint("processor_fencing_version", { mode: "number" }).notNull(),
    observedSnapshotSha256: text("observed_snapshot_sha256"),
    entitlementRevisionBefore: integer("entitlement_revision_before").notNull(),
    entitlementRevisionAfter: integer("entitlement_revision_after").notNull(),
    entitlementSourceReferenceBefore: text("entitlement_source_reference_before").notNull(),
    entitlementSourceReferenceAfter: text("entitlement_source_reference_after").notNull(),
    resultCode: text("result_code").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_saas_webhook_reconciliation_result_decision_uq").on(table.decisionId),
    check("saas_webhook_reconciliation_result_outcome_valid", sql`${table.outcome} in ('applied', 'already_applied', 'ignored', 'stale')`),
    check("saas_webhook_reconciliation_result_revision", sql`(${table.outcome} = 'applied' and ${table.entitlementRevisionAfter} >= ${table.entitlementRevisionBefore}) or (${table.outcome} in ('already_applied', 'ignored', 'stale') and ${table.entitlementRevisionAfter} = ${table.entitlementRevisionBefore} and ${table.entitlementSourceReferenceAfter} = ${table.entitlementSourceReferenceBefore})`),
  ]
);
