import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./auth-users";
import {
  athletes,
  classTemplates,
  enrollments,
  families,
  familyCollectionMode,
  familyPayers,
  locations,
  organizations,
  pricePlans,
  zaltyko,
} from "./zaltyko-core";

export const invoiceStatus = zaltyko.enum("invoice_status", [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "void",
]);

export const chargeStatus = zaltyko.enum("charge_status", [
  "due",
  "partially_paid",
  "paid",
  "void",
]);

export const paymentStatus = zaltyko.enum("payment_status", [
  "pending",
  "succeeded",
  "partially_refunded",
  "refunded",
  "failed",
]);

export const paymentSource = zaltyko.enum("payment_source", [
  "manual",
  "provider",
]);

export const manualPaymentMethod = zaltyko.enum("manual_payment_method", [
  "cash",
  "bank_transfer",
  "card_terminal",
  "other",
]);

export const paymentAttemptStatus = zaltyko.enum("payment_attempt_status", [
  "pending",
  "succeeded",
  "failed",
]);

export const refundStatus = zaltyko.enum("refund_status", [
  "pending",
  "succeeded",
  "failed",
]);

export const providerEnvironment = zaltyko.enum("provider_environment", [
  "sandbox",
  "live",
]);

export const providerEventStatus = zaltyko.enum("provider_event_status", [
  "received",
  "processing",
  "processed",
  "failed",
]);

export const reconciliationStatus = zaltyko.enum("reconciliation_status", [
  "balanced",
  "unbalanced",
]);

const money = (name: string) => bigint(name, { mode: "number" });

export const pricePlanClassTemplateCoverage = zaltyko.table(
  "price_plan_class_template_coverage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    pricePlanId: uuid("price_plan_id").notNull(),
    classTemplateId: uuid("class_template_id").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("price_plan_class_template_coverage_org_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("price_plan_class_template_coverage_lookup_idx").on(
      table.organizationId,
      table.locationId,
      table.pricePlanId,
      table.classTemplateId,
      table.startsOn,
      table.endsOn
    ),
    check(
      "price_plan_class_template_coverage_dates_valid",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`
    ),
    foreignKey({
      name: "price_plan_class_template_coverage_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "price_plan_class_template_coverage_plan_fk",
      columns: [table.organizationId, table.pricePlanId],
      foreignColumns: [pricePlans.organizationId, pricePlans.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "price_plan_class_template_coverage_template_fk",
      columns: [table.organizationId, table.locationId, table.classTemplateId],
      foreignColumns: [
        classTemplates.organizationId,
        classTemplates.locationId,
        classTemplates.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const enrollmentPriceAssignments = zaltyko.table(
  "enrollment_price_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    enrollmentId: uuid("enrollment_id").notNull(),
    pricePlanId: uuid("price_plan_id").notNull(),
    unitAmountCents: money("unit_amount_cents").notNull(),
    currency: text("currency").notNull(),
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
    uniqueIndex("enrollment_price_assignments_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("enrollment_price_assignments_coverage_fk_uq").on(
      table.organizationId,
      table.locationId,
      table.pricePlanId,
      table.enrollmentId,
      table.id
    ),
    uniqueIndex("enrollment_price_assignments_one_open_uq")
      .on(table.organizationId, table.enrollmentId)
      .where(sql`${table.endsOn} is null`),
    index("enrollment_price_assignments_period_idx").on(
      table.organizationId,
      table.enrollmentId,
      table.startsOn,
      table.endsOn
    ),
    check(
      "enrollment_price_assignments_amount_valid",
      sql`${table.unitAmountCents} >= 0`
    ),
    check(
      "enrollment_price_assignments_currency_valid",
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check(
      "enrollment_price_assignments_dates_valid",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`
    ),
    foreignKey({
      name: "enrollment_price_assignments_enrollment_fk",
      columns: [table.organizationId, table.locationId, table.enrollmentId],
      foreignColumns: [
        enrollments.organizationId,
        enrollments.locationId,
        enrollments.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "enrollment_price_assignments_plan_fk",
      columns: [table.organizationId, table.pricePlanId],
      foreignColumns: [pricePlans.organizationId, pricePlans.id],
    }).onDelete("restrict"),
  ]
);

export const invoices = zaltyko.table(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id"),
    familyId: uuid("family_id").notNull(),
    familyPayerId: uuid("family_payer_id"),
    reference: text("reference").notNull(),
    status: invoiceStatus("status").notNull().default("draft"),
    currency: text("currency").notNull(),
    totalAmountCents: money("total_amount_cents").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
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
    uniqueIndex("invoices_reference_uq").on(
      table.organizationId,
      table.reference
    ),
    uniqueIndex("invoices_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("invoices_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("invoices_billing_line_location_fk_uq").on(
      table.organizationId,
      table.locationId,
      table.id
    ),
    uniqueIndex("invoices_organization_id_currency_uq").on(
      table.organizationId,
      table.id,
      table.currency
    ),
    index("invoices_due_status_idx").on(
      table.organizationId,
      table.status,
      table.dueAt
    ),
    check("invoices_reference_not_blank", sql`btrim(${table.reference}) <> ''`),
    check("invoices_currency_valid", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("invoices_total_amount_valid", sql`${table.totalAmountCents} >= 0`),
    check(
      "invoices_idempotency_not_blank",
      sql`btrim(${table.idempotencyKey}) <> ''`
    ),
    check("invoices_version_positive", sql`${table.version} > 0`),
    foreignKey({
      name: "invoices_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoices_family_fk",
      columns: [table.organizationId, table.familyId],
      foreignColumns: [families.organizationId, families.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoices_family_payer_fk",
      columns: [table.organizationId, table.familyId, table.familyPayerId],
      foreignColumns: [
        familyPayers.organizationId,
        familyPayers.familyId,
        familyPayers.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const invoiceLines = zaltyko.table(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").notNull(),
    locationId: uuid("location_id"),
    athleteId: uuid("athlete_id"),
    enrollmentId: uuid("enrollment_id"),
    pricePlanId: uuid("price_plan_id"),
    lineType: text("line_type").notNull(),
    quantity: integer("quantity").notNull(),
    unitAmountCents: money("unit_amount_cents").notNull(),
    amountCents: money("amount_cents").notNull(),
    currency: text("currency").notNull(),
    servicePeriodStart: date("service_period_start").notNull(),
    servicePeriodEnd: date("service_period_end").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("invoice_lines_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("invoice_lines_organization_id_currency_uq").on(
      table.organizationId,
      table.id,
      table.currency
    ),
    uniqueIndex("invoice_lines_coverage_parent_fk_uq").on(
      table.organizationId,
      table.locationId,
      table.athleteId,
      table.pricePlanId,
      table.id
    ),
    uniqueIndex("invoice_lines_monthly_athlete_uq")
      .on(
        table.organizationId,
        table.invoiceId,
        table.athleteId,
        table.servicePeriodStart,
        table.servicePeriodEnd
      )
      .where(
        sql`${table.lineType} = 'monthly_fee' and ${table.athleteId} is not null`
      ),
    index("invoice_lines_invoice_idx").on(
      table.organizationId,
      table.invoiceId
    ),
    check("invoice_lines_type_not_blank", sql`btrim(${table.lineType}) <> ''`),
    check("invoice_lines_quantity_valid", sql`${table.quantity} > 0`),
    check(
      "invoice_lines_unit_amount_valid",
      sql`${table.unitAmountCents} >= 0`
    ),
    check(
      "invoice_lines_amount_valid",
      sql`${table.amountCents} = ${table.quantity}::bigint * ${table.unitAmountCents}`
    ),
    check(
      "invoice_lines_currency_valid",
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check(
      "invoice_lines_period_valid",
      sql`${table.servicePeriodEnd} >= ${table.servicePeriodStart}`
    ),
    check(
      "invoice_lines_athlete_monthly_shape",
      sql`${table.athleteId} is null or (
        ${table.lineType} = 'monthly_fee'
        and ${table.locationId} is not null
        and ${table.pricePlanId} is not null
        and ${table.enrollmentId} is null
        and ${table.quantity} = 1
        and ${table.servicePeriodStart} = date_trunc('month', ${table.servicePeriodStart})::date
        and ${table.servicePeriodEnd} = (
          date_trunc('month', ${table.servicePeriodStart}) + interval '1 month - 1 day'
        )::date
      )`
    ),
    foreignKey({
      name: "invoice_lines_invoice_fk",
      columns: [table.organizationId, table.invoiceId, table.currency],
      foreignColumns: [invoices.organizationId, invoices.id, invoices.currency],
    }).onDelete("cascade"),
    foreignKey({
      name: "invoice_lines_location_invoice_fk",
      columns: [table.organizationId, table.locationId, table.invoiceId],
      foreignColumns: [
        invoices.organizationId,
        invoices.locationId,
        invoices.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "invoice_lines_enrollment_fk",
      columns: [table.organizationId, table.enrollmentId],
      foreignColumns: [enrollments.organizationId, enrollments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoice_lines_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoice_lines_athlete_fk",
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoice_lines_price_plan_fk",
      columns: [table.organizationId, table.pricePlanId],
      foreignColumns: [pricePlans.organizationId, pricePlans.id],
    }).onDelete("restrict"),
  ]
);

export const invoiceLineEnrollments = zaltyko.table(
  "invoice_line_enrollments",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    athleteId: uuid("athlete_id").notNull(),
    invoiceLineId: uuid("invoice_line_id").notNull(),
    pricePlanId: uuid("price_plan_id").notNull(),
    enrollmentId: uuid("enrollment_id").notNull(),
    classTemplateId: uuid("class_template_id").notNull(),
    priceAssignmentId: uuid("price_assignment_id").notNull(),
    classNameSnapshot: text("class_name_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "invoice_line_enrollments_pkey",
      columns: [table.organizationId, table.invoiceLineId, table.enrollmentId],
    }),
    uniqueIndex("invoice_line_enrollments_line_template_uq").on(
      table.organizationId,
      table.invoiceLineId,
      table.classTemplateId
    ),
    index("invoice_line_enrollments_enrollment_idx").on(
      table.organizationId,
      table.locationId,
      table.enrollmentId
    ),
    check(
      "invoice_line_enrollments_class_name_not_blank",
      sql`char_length(btrim(${table.classNameSnapshot})) between 2 and 120`
    ),
    foreignKey({
      name: "invoice_line_enrollments_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoice_line_enrollments_athlete_fk",
      columns: [table.organizationId, table.athleteId],
      foreignColumns: [athletes.organizationId, athletes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoice_line_enrollments_line_fk",
      columns: [
        table.organizationId,
        table.locationId,
        table.athleteId,
        table.pricePlanId,
        table.invoiceLineId,
      ],
      foreignColumns: [
        invoiceLines.organizationId,
        invoiceLines.locationId,
        invoiceLines.athleteId,
        invoiceLines.pricePlanId,
        invoiceLines.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoice_line_enrollments_enrollment_fk",
      columns: [
        table.organizationId,
        table.locationId,
        table.athleteId,
        table.classTemplateId,
        table.enrollmentId,
      ],
      foreignColumns: [
        enrollments.organizationId,
        enrollments.locationId,
        enrollments.athleteId,
        enrollments.classTemplateId,
        enrollments.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoice_line_enrollments_class_template_fk",
      columns: [table.organizationId, table.locationId, table.classTemplateId],
      foreignColumns: [
        classTemplates.organizationId,
        classTemplates.locationId,
        classTemplates.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoice_line_enrollments_price_assignment_fk",
      columns: [
        table.organizationId,
        table.locationId,
        table.pricePlanId,
        table.enrollmentId,
        table.priceAssignmentId,
      ],
      foreignColumns: [
        enrollmentPriceAssignments.organizationId,
        enrollmentPriceAssignments.locationId,
        enrollmentPriceAssignments.pricePlanId,
        enrollmentPriceAssignments.enrollmentId,
        enrollmentPriceAssignments.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const charges = zaltyko.table(
  "charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id"),
    invoiceId: uuid("invoice_id").notNull(),
    invoiceLineId: uuid("invoice_line_id").notNull(),
    familyId: uuid("family_id").notNull(),
    familyPayerId: uuid("family_payer_id"),
    enrollmentId: uuid("enrollment_id"),
    collectionMode: familyCollectionMode("collection_mode")
      .notNull()
      .default("manual"),
    status: chargeStatus("status").notNull().default("due"),
    amountCents: money("amount_cents").notNull(),
    currency: text("currency").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    servicePeriodStart: date("service_period_start").notNull(),
    servicePeriodEnd: date("service_period_end").notNull(),
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
    uniqueIndex("charges_invoice_line_uq").on(
      table.organizationId,
      table.invoiceLineId
    ),
    uniqueIndex("charges_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("charges_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("charges_organization_id_currency_uq").on(
      table.organizationId,
      table.id,
      table.currency
    ),
    index("charges_due_status_idx").on(
      table.organizationId,
      table.status,
      table.dueAt
    ),
    index("charges_service_period_idx").on(
      table.organizationId,
      table.currency,
      table.servicePeriodStart,
      table.servicePeriodEnd
    ),
    check("charges_amount_valid", sql`${table.amountCents} > 0`),
    check("charges_currency_valid", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "charges_period_valid",
      sql`${table.servicePeriodEnd} >= ${table.servicePeriodStart}`
    ),
    check(
      "charges_idempotency_not_blank",
      sql`btrim(${table.idempotencyKey}) <> ''`
    ),
    check("charges_version_positive", sql`${table.version} > 0`),
    foreignKey({
      name: "charges_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "charges_invoice_fk",
      columns: [table.organizationId, table.invoiceId, table.currency],
      foreignColumns: [invoices.organizationId, invoices.id, invoices.currency],
    }).onDelete("restrict"),
    foreignKey({
      name: "charges_invoice_line_fk",
      columns: [table.organizationId, table.invoiceLineId, table.currency],
      foreignColumns: [
        invoiceLines.organizationId,
        invoiceLines.id,
        invoiceLines.currency,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "charges_family_fk",
      columns: [table.organizationId, table.familyId],
      foreignColumns: [families.organizationId, families.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "charges_family_payer_fk",
      columns: [table.organizationId, table.familyId, table.familyPayerId],
      foreignColumns: [
        familyPayers.organizationId,
        familyPayers.familyId,
        familyPayers.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "charges_enrollment_fk",
      columns: [table.organizationId, table.enrollmentId],
      foreignColumns: [enrollments.organizationId, enrollments.id],
    }).onDelete("restrict"),
  ]
);

export const payments = zaltyko.table(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id"),
    familyId: uuid("family_id").notNull(),
    familyPayerId: uuid("family_payer_id"),
    source: paymentSource("source").notNull().default("provider"),
    status: paymentStatus("status").notNull(),
    amountCents: money("amount_cents").notNull(),
    currency: text("currency").notNull(),
    processor: text("processor"),
    environment: providerEnvironment("environment"),
    providerPaymentId: text("provider_payment_id"),
    manualMethod: manualPaymentMethod("manual_method"),
    manualReference: text("manual_reference"),
    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUsers.id,
      {
        onDelete: "restrict",
      }
    ),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
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
    uniqueIndex("payments_provider_uq")
      .on(table.processor, table.environment, table.providerPaymentId)
      .where(sql`${table.source} = 'provider'`),
    uniqueIndex("payments_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("payments_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("payments_organization_id_currency_uq").on(
      table.organizationId,
      table.id,
      table.currency
    ),
    index("payments_received_idx").on(
      table.organizationId,
      table.currency,
      table.receivedAt
    ),
    check("payments_amount_valid", sql`${table.amountCents} > 0`),
    check("payments_currency_valid", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "payments_source_fields_valid",
      sql`(${table.source} = 'provider'
        and ${table.processor} is not null and btrim(${table.processor}) <> ''
        and ${table.environment} is not null
        and ${table.providerPaymentId} is not null and btrim(${table.providerPaymentId}) <> ''
        and ${table.manualMethod} is null and ${table.recordedByUserId} is null)
      or (${table.source} = 'manual'
        and ${table.processor} is null and ${table.environment} is null
        and ${table.providerPaymentId} is null and ${table.manualMethod} is not null
        and ${table.recordedByUserId} is not null)`
    ),
    check(
      "payments_manual_reference_length",
      sql`${table.manualReference} is null or length(btrim(${table.manualReference})) <= 200`
    ),
    check(
      "payments_idempotency_not_blank",
      sql`btrim(${table.idempotencyKey}) <> ''`
    ),
    check("payments_version_positive", sql`${table.version} > 0`),
    foreignKey({
      name: "payments_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "payments_family_fk",
      columns: [table.organizationId, table.familyId],
      foreignColumns: [families.organizationId, families.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "payments_family_payer_fk",
      columns: [table.organizationId, table.familyId, table.familyPayerId],
      foreignColumns: [
        familyPayers.organizationId,
        familyPayers.familyId,
        familyPayers.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const paymentProviderEvents = zaltyko.table(
  "payment_provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    processor: text("processor").notNull(),
    environment: providerEnvironment("environment").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    signatureVerified: boolean("signature_verified").notNull(),
    status: providerEventStatus("status").notNull().default("received"),
    effectType: text("effect_type"),
    effectId: uuid("effect_id"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_provider_events_provider_uq").on(
      table.processor,
      table.environment,
      table.providerEventId
    ),
    uniqueIndex("payment_provider_events_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("payment_provider_events_processing_idx").on(
      table.status,
      table.receivedAt
    ),
    check(
      "payment_provider_events_processor_not_blank",
      sql`btrim(${table.processor}) <> ''`
    ),
    check(
      "payment_provider_events_provider_id_not_blank",
      sql`btrim(${table.providerEventId}) <> ''`
    ),
    check(
      "payment_provider_events_type_not_blank",
      sql`btrim(${table.eventType}) <> ''`
    ),
    check(
      "payment_provider_events_sha_valid",
      sql`${table.payloadSha256} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "payment_provider_events_payload_object",
      sql`jsonb_typeof(${table.payload}) = 'object'`
    ),
    check(
      "payment_provider_events_signature_verified",
      sql`${table.signatureVerified}`
    ),
    check(
      "payment_provider_events_attempts_non_negative",
      sql`${table.attempts} >= 0`
    ),
  ]
);

export const paymentAttempts = zaltyko.table(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id"),
    familyId: uuid("family_id").notNull(),
    familyPayerId: uuid("family_payer_id"),
    invoiceId: uuid("invoice_id"),
    paymentId: uuid("payment_id"),
    status: paymentAttemptStatus("status").notNull(),
    amountCents: money("amount_cents").notNull(),
    currency: text("currency").notNull(),
    processor: text("processor").notNull(),
    environment: providerEnvironment("environment").notNull(),
    providerAttemptId: text("provider_attempt_id").notNull(),
    failureCode: text("failure_code"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
    providerEventId: uuid("provider_event_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_attempts_provider_uq").on(
      table.processor,
      table.environment,
      table.providerAttemptId
    ),
    uniqueIndex("payment_attempts_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("payment_attempts_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("payment_attempts_invoice_idx").on(
      table.organizationId,
      table.invoiceId,
      table.attemptedAt
    ),
    check("payment_attempts_amount_valid", sql`${table.amountCents} > 0`),
    check(
      "payment_attempts_currency_valid",
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check(
      "payment_attempts_processor_not_blank",
      sql`btrim(${table.processor}) <> ''`
    ),
    check(
      "payment_attempts_provider_id_not_blank",
      sql`btrim(${table.providerAttemptId}) <> ''`
    ),
    check(
      "payment_attempts_idempotency_not_blank",
      sql`btrim(${table.idempotencyKey}) <> ''`
    ),
    foreignKey({
      name: "payment_attempts_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_attempts_family_fk",
      columns: [table.organizationId, table.familyId],
      foreignColumns: [families.organizationId, families.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_attempts_family_payer_fk",
      columns: [table.organizationId, table.familyId, table.familyPayerId],
      foreignColumns: [
        familyPayers.organizationId,
        familyPayers.familyId,
        familyPayers.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_attempts_invoice_fk",
      columns: [table.organizationId, table.invoiceId, table.currency],
      foreignColumns: [invoices.organizationId, invoices.id, invoices.currency],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_attempts_payment_fk",
      columns: [table.organizationId, table.paymentId, table.currency],
      foreignColumns: [payments.organizationId, payments.id, payments.currency],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_attempts_provider_event_fk",
      columns: [table.organizationId, table.providerEventId],
      foreignColumns: [
        paymentProviderEvents.organizationId,
        paymentProviderEvents.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const paymentAllocations = zaltyko.table(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").notNull(),
    chargeId: uuid("charge_id").notNull(),
    amountCents: money("amount_cents").notNull(),
    currency: text("currency").notNull(),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_allocations_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("payment_allocations_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("payment_allocations_organization_id_currency_uq").on(
      table.organizationId,
      table.id,
      table.currency
    ),
    index("payment_allocations_payment_idx").on(
      table.organizationId,
      table.paymentId,
      table.allocatedAt
    ),
    index("payment_allocations_charge_idx").on(
      table.organizationId,
      table.chargeId,
      table.allocatedAt
    ),
    check("payment_allocations_amount_valid", sql`${table.amountCents} > 0`),
    check(
      "payment_allocations_currency_valid",
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check(
      "payment_allocations_idempotency_not_blank",
      sql`btrim(${table.idempotencyKey}) <> ''`
    ),
    foreignKey({
      name: "payment_allocations_payment_fk",
      columns: [table.organizationId, table.paymentId, table.currency],
      foreignColumns: [payments.organizationId, payments.id, payments.currency],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_allocations_charge_fk",
      columns: [table.organizationId, table.chargeId, table.currency],
      foreignColumns: [charges.organizationId, charges.id, charges.currency],
    }).onDelete("restrict"),
  ]
);

export const refunds = zaltyko.table(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").notNull(),
    paymentAllocationId: uuid("payment_allocation_id").notNull(),
    status: refundStatus("status").notNull(),
    amountCents: money("amount_cents").notNull(),
    currency: text("currency").notNull(),
    processor: text("processor").notNull(),
    environment: providerEnvironment("environment").notNull(),
    providerRefundId: text("provider_refund_id").notNull(),
    reasonCode: text("reason_code").notNull(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }).notNull(),
    providerEventId: uuid("provider_event_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("refunds_provider_uq").on(
      table.processor,
      table.environment,
      table.providerRefundId
    ),
    uniqueIndex("refunds_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("refunds_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("refunds_payment_idx").on(
      table.organizationId,
      table.paymentId,
      table.refundedAt
    ),
    check("refunds_amount_valid", sql`${table.amountCents} > 0`),
    check("refunds_currency_valid", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("refunds_processor_not_blank", sql`btrim(${table.processor}) <> ''`),
    check(
      "refunds_provider_id_not_blank",
      sql`btrim(${table.providerRefundId}) <> ''`
    ),
    check("refunds_reason_not_blank", sql`btrim(${table.reasonCode}) <> ''`),
    check(
      "refunds_idempotency_not_blank",
      sql`btrim(${table.idempotencyKey}) <> ''`
    ),
    foreignKey({
      name: "refunds_payment_fk",
      columns: [table.organizationId, table.paymentId, table.currency],
      foreignColumns: [payments.organizationId, payments.id, payments.currency],
    }).onDelete("restrict"),
    foreignKey({
      name: "refunds_allocation_fk",
      columns: [
        table.organizationId,
        table.paymentAllocationId,
        table.currency,
      ],
      foreignColumns: [
        paymentAllocations.organizationId,
        paymentAllocations.id,
        paymentAllocations.currency,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "refunds_provider_event_fk",
      columns: [table.organizationId, table.providerEventId],
      foreignColumns: [
        paymentProviderEvents.organizationId,
        paymentProviderEvents.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const financialReconciliationRuns = zaltyko.table(
  "financial_reconciliation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    currency: text("currency").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    expectedCents: money("expected_cents").notNull(),
    allocatedCents: money("allocated_cents").notNull(),
    refundedCents: money("refunded_cents").notNull(),
    netCollectedCents: money("net_collected_cents").notNull(),
    outstandingCents: money("outstanding_cents").notNull(),
    status: reconciliationStatus("status").notNull(),
    formulaVersion: integer("formula_version").notNull().default(1),
    sourceWatermark: timestamp("source_watermark", {
      withTimezone: true,
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("financial_reconciliation_natural_uq").on(
      table.organizationId,
      table.currency,
      table.periodStart,
      table.periodEnd,
      table.formulaVersion
    ),
    uniqueIndex("financial_reconciliation_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    check(
      "financial_reconciliation_currency_valid",
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check(
      "financial_reconciliation_period_valid",
      sql`${table.periodEnd} >= ${table.periodStart}`
    ),
    check(
      "financial_reconciliation_amounts_valid",
      sql`${table.expectedCents} >= 0
        and ${table.allocatedCents} >= 0
        and ${table.refundedCents} >= 0
        and ${table.allocatedCents} <= ${table.expectedCents}
        and ${table.refundedCents} <= ${table.allocatedCents}
        and ${table.netCollectedCents} = ${table.allocatedCents} - ${table.refundedCents}
        and ${table.outstandingCents} = ${table.expectedCents} - ${table.allocatedCents}`
    ),
    check(
      "financial_reconciliation_formula_positive",
      sql`${table.formulaVersion} > 0`
    ),
    check(
      "financial_reconciliation_idempotency_not_blank",
      sql`btrim(${table.idempotencyKey}) <> ''`
    ),
  ]
);

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type PaymentProviderEvent = typeof paymentProviderEvents.$inferSelect;
export type FinancialReconciliationRun =
  typeof financialReconciliationRuns.$inferSelect;
