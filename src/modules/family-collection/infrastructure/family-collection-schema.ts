import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  families,
  familyPayers,
  familyPaymentAuthorizations,
  locations,
  organizationMembers,
  organizationPaymentProviderAccounts,
  organizations,
  zaltyko,
} from "@/db/schema/zaltyko-core";
import { charges, invoices, payments } from "@/db/schema/zaltyko-ledger";

/**
 * Cobro automático de cuotas, Fase 3: intentos de cobro de una factura
 * mensual, su reparto entre cuotas y el día de cobro de cada academia.
 *
 * Espejo del candidato SQL
 * docs/deployment/candidates/20261117120000_family_collection_candidate.sql,
 * que requiere autorización de Elvis y no está aplicado en ningún entorno.
 *
 * Igual que payment-reminders y family-payment-methods, estas tablas NO se
 * exportan desde `src/db/schema/index.ts` ni desde `src/db/zaltyko-schema.ts`,
 * y `drizzle.config.ts` no las lee: un `db:generate`/`push` las crearía sin
 * RLS ni REVOKE. Viven fuera de `src/db/schema/` porque `pnpm validate:rls`
 * exige a cada tabla con academia de ese directorio RLS y política en el
 * historial aplicado (`supabase/migrations`), y este candidato no está en él.
 * tests/family-collection-contract.test.ts comprueba que el candidato, este
 * archivo y la detección de almacenamiento describen lo mismo.
 *
 * Consultarlas solo tras isFamilyCollectionStorageAvailable().
 * Solo la referencia opaca del cobro (pi_) y códigos de Stripe: nunca
 * mensajes, datos de tarjeta ni de banco.
 *
 * El candidato usa `on delete set null (updated_by_member_id)` (PostgreSQL
 * 15+) para no anular organization_id; Drizzle no expresa esa lista de
 * columnas, así que aquí figura como "set null".
 */

export const FAMILY_COLLECTION_ATTEMPT_STATUSES = [
  "claimed",
  "created",
  "processing",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type FamilyCollectionAttemptStatus = (typeof FAMILY_COLLECTION_ATTEMPT_STATUSES)[number];

/** Estados no terminales: como mucho uno por factura (índice único parcial). */
export const FAMILY_COLLECTION_OPEN_STATUSES = ["claimed", "created", "processing"] as const;

export const FAMILY_COLLECTION_ALLOCATION_STATUSES = ["pending", "allocated", "needs_review"] as const;
export type FamilyCollectionAllocationStatus = (typeof FAMILY_COLLECTION_ALLOCATION_STATUSES)[number];

/** Límites que también comprueba la base. */
export const FAMILY_COLLECTION_MAX_ATTEMPTS_PER_INVOICE = 5;
export const FAMILY_COLLECTION_MAX_RESUMES = 3;

export const familyCollectionAttempts = zaltyko.table(
  "family_collection_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    familyId: uuid("family_id").notNull(),
    // Pagador, autorización, cuenta y tipo: null solo en un intento `canceled`.
    familyPayerId: uuid("family_payer_id"),
    authorizationId: uuid("authorization_id"),
    paymentProviderAccountId: uuid("payment_provider_account_id"),
    attemptNumber: integer("attempt_number").notNull(),
    paymentMethodKind: text("payment_method_kind"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").$type<FamilyCollectionAttemptStatus>().notNull(),
    // pi_… del cobro en la cuenta conectada; null en `claimed` (y en
    // `failed`/`canceled` que nunca llegaron a Stripe).
    providerPaymentIntentReference: text("provider_payment_intent_reference"),
    failureCode: text("failure_code"),
    declineCode: text("decline_code"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    resumeCount: integer("resume_count").notNull().default(0),
    paymentId: uuid("payment_id"),
    allocationStatus: text("allocation_status").$type<FamilyCollectionAllocationStatus>(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("family_collection_attempts_organization_id_id_uq").on(table.organizationId, table.id),
    unique("family_collection_attempts_number_uq").on(table.organizationId, table.invoiceId, table.attemptNumber),
    unique("family_collection_attempts_intent_uq").on(table.organizationId, table.providerPaymentIntentReference),
    unique("family_collection_attempts_payment_uq").on(table.organizationId, table.paymentId),
    uniqueIndex("family_collection_attempts_open_uq")
      .on(table.organizationId, table.invoiceId)
      .where(sql.raw("status in ('claimed', 'created', 'processing')")),
    index("family_collection_attempts_retry_idx").on(table.organizationId, table.status, table.nextRetryAt),
    index("family_collection_attempts_resume_idx").on(table.status, table.claimedAt),
    check("family_collection_attempts_attempt_number_check", sql.raw("attempt_number between 1 and 5")),
    check(
      "family_collection_attempts_method_kind_check",
      sql.raw("payment_method_kind is null or payment_method_kind in ('card', 'sepa_debit')")
    ),
    check("family_collection_attempts_amount_check", sql.raw("amount_cents > 0")),
    check("family_collection_attempts_currency_check", sql.raw("currency = 'EUR'")),
    check(
      "family_collection_attempts_status_check",
      sql.raw("status in ('claimed', 'created', 'processing', 'succeeded', 'failed', 'canceled')")
    ),
    check(
      "family_collection_attempts_allocation_status_check",
      sql.raw("allocation_status is null or allocation_status in ('pending', 'allocated', 'needs_review')")
    ),
    check("family_collection_attempts_resume_count_check", sql.raw("resume_count between 0 and 3")),
    check(
      "family_collection_attempts_intent_reference_format",
      sql.raw(
        "provider_payment_intent_reference is null or (char_length(provider_payment_intent_reference) <= 255 and provider_payment_intent_reference ~ '^pi_[A-Za-z0-9_]+$')"
      )
    ),
    check(
      "family_collection_attempts_intent_reference_by_status",
      sql.raw(
        "(status not in ('created', 'processing', 'succeeded') or provider_payment_intent_reference is not null) and (status <> 'claimed' or provider_payment_intent_reference is null)"
      )
    ),
    check(
      "family_collection_attempts_failure_code_format",
      sql.raw("failure_code is null or failure_code ~ '^[a-z0-9_]{1,64}$'")
    ),
    check(
      "family_collection_attempts_decline_code_format",
      sql.raw("decline_code is null or decline_code ~ '^[a-z0-9_]{1,64}$'")
    ),
    check(
      "family_collection_attempts_codes_only_when_unsuccessful",
      sql.raw("status in ('failed', 'canceled') or (failure_code is null and decline_code is null)")
    ),
    check(
      "family_collection_attempts_reason_required",
      sql.raw(
        "provider_payment_intent_reference is not null or status not in ('failed', 'canceled') or failure_code is not null"
      )
    ),
    check(
      "family_collection_attempts_next_retry_only_failed",
      sql.raw("next_retry_at is null or status = 'failed'")
    ),
    check(
      "family_collection_attempts_payment_iff_succeeded",
      sql.raw("(status = 'succeeded') = (payment_id is not null)")
    ),
    check(
      "family_collection_attempts_allocation_iff_succeeded",
      sql.raw("(status = 'succeeded') = (allocation_status is not null)")
    ),
    check(
      "family_collection_attempts_completed_iff_terminal",
      sql.raw("(status in ('succeeded', 'failed', 'canceled')) = (completed_at is not null)")
    ),
    check(
      "family_collection_attempts_references_required",
      sql.raw(
        "status = 'canceled' or (family_payer_id is not null and authorization_id is not null and payment_provider_account_id is not null and payment_method_kind is not null)"
      )
    ),
    foreignKey({
      name: "family_collection_attempts_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_collection_attempts_invoice_fk",
      columns: [table.organizationId, table.locationId, table.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.locationId, invoices.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_collection_attempts_invoice_currency_fk",
      columns: [table.organizationId, table.invoiceId, table.currency],
      foreignColumns: [invoices.organizationId, invoices.id, invoices.currency],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_collection_attempts_family_fk",
      columns: [table.organizationId, table.familyId],
      foreignColumns: [families.organizationId, families.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_collection_attempts_payer_fk",
      columns: [table.organizationId, table.familyId, table.familyPayerId],
      foreignColumns: [familyPayers.organizationId, familyPayers.familyId, familyPayers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_collection_attempts_authorization_fk",
      columns: [table.organizationId, table.authorizationId],
      foreignColumns: [familyPaymentAuthorizations.organizationId, familyPaymentAuthorizations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_collection_attempts_provider_account_fk",
      columns: [table.organizationId, table.paymentProviderAccountId],
      foreignColumns: [organizationPaymentProviderAccounts.organizationId, organizationPaymentProviderAccounts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_collection_attempts_payment_fk",
      columns: [table.organizationId, table.paymentId, table.currency],
      foreignColumns: [payments.organizationId, payments.id, payments.currency],
    }).onDelete("restrict"),
  ]
);

export const familyCollectionAttemptCharges = zaltyko.table(
  "family_collection_attempt_charges",
  {
    attemptId: uuid("attempt_id").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ name: "family_collection_attempt_charges_pkey", columns: [table.attemptId, table.chargeId] }),
    index("family_collection_attempt_charges_charge_idx").on(table.organizationId, table.chargeId),
    check("family_collection_attempt_charges_amount_check", sql.raw("amount_cents > 0")),
    foreignKey({
      name: "family_collection_attempt_charges_attempt_fk",
      columns: [table.organizationId, table.attemptId],
      foreignColumns: [familyCollectionAttempts.organizationId, familyCollectionAttempts.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "family_collection_attempt_charges_charge_fk",
      columns: [table.organizationId, table.chargeId],
      foreignColumns: [charges.organizationId, charges.id],
    }).onDelete("restrict"),
  ]
);

export const organizationCollectionSettings = zaltyko.table(
  "organization_collection_settings",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // null = día de vencimiento; 1..31 = ese día del mes (el dominio lo
    // ajusta al último día de los meses más cortos).
    collectionDayOfMonth: smallint("collection_day_of_month"),
    version: integer("version").notNull().default(1),
    updatedByMemberId: uuid("updated_by_member_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("organization_collection_settings_member_idx").on(table.organizationId, table.updatedByMemberId),
    check(
      "organization_collection_settings_day_check",
      sql.raw("collection_day_of_month is null or collection_day_of_month between 1 and 31")
    ),
    check("organization_collection_settings_version_check", sql.raw("version > 0")),
    foreignKey({
      name: "organization_collection_settings_member_fk",
      columns: [table.organizationId, table.updatedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }).onDelete("set null"),
  ]
);

export type FamilyCollectionAttemptRow = typeof familyCollectionAttempts.$inferSelect;
export type FamilyCollectionAttemptChargeRow = typeof familyCollectionAttemptCharges.$inferSelect;
export type OrganizationCollectionSettingsRow = typeof organizationCollectionSettings.$inferSelect;
