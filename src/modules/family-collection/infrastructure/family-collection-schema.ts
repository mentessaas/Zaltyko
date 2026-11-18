import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { charges, invoices, paymentProviderEvents, payments } from "@/db/schema/zaltyko-ledger";

/**
 * Cobro automático de cuotas, Fase 3: intentos de cobro de una factura
 * mensual, su reparto entre cuotas y el día de cobro de cada academia.
 * Fase 4: el estado requires_action con su plazo (action_deadline_at) y las
 * disputas de los cobros.
 *
 * Espejo de los candidatos SQL
 * docs/deployment/candidates/20261117120000_family_collection_candidate.sql
 * (Fase 3) y docs/deployment/candidates/20261118120000_family_collection_events_candidate.sql
 * (Fase 4, sobre la Fase 3), que requieren autorización de Elvis y no están
 * aplicados en ningún entorno. Este archivo describe la base con las dos.
 *
 * Una base puede tener solo la Fase 3: el código de la Fase 3
 * consulta con SQL propio que nunca nombra action_deadline_at ni las disputas,
 * y ninguna consulta usa este espejo con el constructor de Drizzle (que
 * pediría todas sus columnas). Lo de la Fase 4 se lee o escribe solo tras
 * isFamilyCollectionEventsStorageAvailable() (forma "phase4").
 *
 * Igual que payment-reminders y family-payment-methods, estas tablas
 * NO se exportan desde `src/db/schema/index.ts` ni desde `src/db/zaltyko-schema.ts`,
 * y `drizzle.config.ts` no las lee: un `db:generate`/`push` las crearía sin
 * RLS ni REVOKE. Viven fuera de `src/db/schema/` porque `pnpm validate:rls`
 * exige a cada tabla con academia de ese directorio RLS y política en el
 * historial aplicado (`supabase/migrations`), y este candidato no está en él.
 * tests/family-collection-contract.test.ts comprueba que los candidatos, este
 * archivo y la detección de almacenamiento describen lo mismo.
 *
 * Consultarlas solo tras isFamilyCollectionStorageAvailable().
 * Solo referencias opacas de Stripe (pi_, ch_, py_, dp_, du_) y códigos de
 * Stripe: nunca mensajes, datos de tarjeta ni de banco.
 *
 * Los candidatos usan `on delete set null (updated_by_member_id)` y
 * `on delete set null (last_provider_event_id)` (PostgreSQL 15+) para no
 * anular organization_id; Drizzle no expresa esa lista de columnas, así que
 * aquí figura como "set null".
 */

// Fase 4: "requires_action" = la familia tiene que confirmar el pago con su
// banco (solo tarjeta, con pi_ y con plazo en action_deadline_at). Solo existe
// con la forma "phase4".
export const FAMILY_COLLECTION_ATTEMPT_STATUSES = [
  "claimed",
  "created",
  "processing",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type FamilyCollectionAttemptStatus = (typeof FAMILY_COLLECTION_ATTEMPT_STATUSES)[number];

/** Estados no terminales: como mucho uno por factura (índice único parcial). */
export const FAMILY_COLLECTION_OPEN_STATUSES = ["claimed", "created", "processing", "requires_action"] as const;

export const FAMILY_COLLECTION_ALLOCATION_STATUSES = ["pending", "allocated", "needs_review"] as const;
export type FamilyCollectionAllocationStatus = (typeof FAMILY_COLLECTION_ALLOCATION_STATUSES)[number];

/**
 * Motivo (`failure_code`) del intento `canceled` que cierra una cuota cuyo
 * cobro ya no llegó a tiempo: pasó la espera de los recordatorios y la cuota
 * volvió a ellos (family-collection-collect.ts, `collectionWindowExpired`).
 */
export const COLLECTION_WINDOW_EXPIRED_CODE = "collection_window_expired";

/** Límites que también comprueba la base. */
export const FAMILY_COLLECTION_MAX_ATTEMPTS_PER_INVOICE = 5;
export const FAMILY_COLLECTION_MAX_RESUMES = 3;

/**
 * Un intento reclamado o creado que nadie ha tocado (`updated_at`) en este
 * tiempo se puede «Marcar como revisado» aunque no tenga aviso: es la salida
 * si el proceso diario deja de pasar (p. ej. se quitó su trabajo de pg_cron).
 * Mientras el proceso pasa, cada reanudación lo toca y, agotadas, hay aviso.
 */
export const FAMILY_COLLECTION_STALE_OPEN_ATTEMPT_MS = 24 * 60 * 60 * 1000;

/**
 * Un cobro en curso (`processing`) reclamado (`claimed_at`) hace más de esto
 * ya no es normal: una domiciliación se resuelve en días, no en semanas. Si
 * Stripe no deja leerlo (p. ej. la academia cerró o desconectó su cuenta), el
 * proceso diario avisa a la academia (`processing_unreadable`), y la academia
 * puede «Marcar como revisado» aunque no haya aviso. La acción vuelve a leer
 * Stripe: si sigue en curso no lo cierra; si Stripe responde con un error
 * permanente, lo cierra sin saber si se cobró (`reviewed_unverifiable`) y la
 * academia lo comprueba en su panel de Stripe.
 */
export const FAMILY_COLLECTION_PROCESSING_UNREADABLE_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * Fase 4: un intento `requires_action` sin cambios (`updated_at`) en este
 * tiempo ya pasó su plazo hace al menos un día: el plazo acaba como mucho al
 * final del 3.er día tras la fecha de su ventana de cobro, y el intento entra
 * en ese estado no antes de esa fecha (como mucho 4 días locales, más un día
 * por la zona horaria). Si sigue abierto es que el proceso diario dejó de
 * pasar: la academia puede «Marcar como revisado» aunque no tenga aviso.
 */
export const FAMILY_COLLECTION_STALE_REQUIRES_ACTION_MS = 6 * 24 * 60 * 60 * 1000;

/**
 * ¿Puede la academia «Marcar como revisado» este intento? Abierto y con un
 * aviso de revisión, con las reanudaciones agotadas, reclamado/creado sin
 * cambios desde hace más de FAMILY_COLLECTION_STALE_OPEN_ATTEMPT_MS, en curso
 * desde hace más de FAMILY_COLLECTION_PROCESSING_UNREADABLE_MS o (Fase 4)
 * esperando a la familia (`requires_action`) sin cambios desde hace más de
 * FAMILY_COLLECTION_STALE_REQUIRES_ACTION_MS. Antes de eso, un
 * `requires_action` sin aviso no se ofrece: la familia aún puede confirmar el
 * pago y el proceso diario lo cierra al pasar su plazo. La misma
 * regla para la pantalla (family-collection-reads.ts) y para la acción
 * (family-collection-academy-actions.ts), que además lee Stripe antes de cerrar.
 */
export function academyCanMarkReviewed(
  attempt: {
    status: string;
    hasReviewNotice: boolean;
    resumeCount: number;
    updatedAt: Date | null;
    claimedAt: Date | null;
  },
  now: Date
): boolean {
  if (!(FAMILY_COLLECTION_OPEN_STATUSES as readonly string[]).includes(attempt.status)) return false;
  if (attempt.hasReviewNotice || attempt.resumeCount >= FAMILY_COLLECTION_MAX_RESUMES) return true;
  return isStaleOpenAttempt(attempt, now);
}

function olderThan(instant: Date | null, now: Date, ms: number): boolean {
  const time = instant?.getTime();
  return time !== undefined && Number.isFinite(time) && now.getTime() - time > ms;
}

/** En curso (`processing`) y reclamado hace más de FAMILY_COLLECTION_PROCESSING_UNREADABLE_MS. */
export function isLongProcessingAttempt(attempt: { status: string; claimedAt: Date | null }, now: Date): boolean {
  return attempt.status === "processing" && olderThan(attempt.claimedAt, now, FAMILY_COLLECTION_PROCESSING_UNREADABLE_MS);
}

/**
 * Abierto y parado: reclamado o creado sin cambios desde hace más de
 * FAMILY_COLLECTION_STALE_OPEN_ATTEMPT_MS, en curso desde hace más de
 * FAMILY_COLLECTION_PROCESSING_UNREADABLE_MS (`isLongProcessingAttempt`) o
 * (Fase 4) `requires_action` sin cambios desde hace más de
 * FAMILY_COLLECTION_STALE_REQUIRES_ACTION_MS (su plazo ya pasó).
 */
export function isStaleOpenAttempt(
  attempt: { status: string; updatedAt: Date | null; claimedAt: Date | null },
  now: Date
): boolean {
  if (attempt.status === "processing") return isLongProcessingAttempt(attempt, now);
  if (attempt.status === "requires_action") {
    return olderThan(attempt.updatedAt, now, FAMILY_COLLECTION_STALE_REQUIRES_ACTION_MS);
  }
  if (attempt.status !== "claimed" && attempt.status !== "created") return false;
  return olderThan(attempt.updatedAt, now, FAMILY_COLLECTION_STALE_OPEN_ATTEMPT_MS);
}

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
    // Fase 4: plazo para confirmar con el banco; obligatorio en `requires_action`.
    actionDeadlineAt: timestamp("action_deadline_at", { withTimezone: true }),
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
      .where(sql.raw("status in ('claimed', 'created', 'processing', 'requires_action')")),
    // Un solo intento cobrado por factura: nunca dos cobros registrados.
    uniqueIndex("family_collection_attempts_succeeded_uq")
      .on(table.organizationId, table.invoiceId)
      .where(sql.raw("status = 'succeeded'")),
    index("family_collection_attempts_retry_idx").on(table.organizationId, table.status, table.nextRetryAt),
    index("family_collection_attempts_resume_idx").on(table.status, table.updatedAt),
    check("family_collection_attempts_attempt_number_check", sql.raw("attempt_number between 1 and 5")),
    check(
      "family_collection_attempts_method_kind_check",
      sql.raw("payment_method_kind is null or payment_method_kind in ('card', 'sepa_debit')")
    ),
    check("family_collection_attempts_amount_check", sql.raw("amount_cents > 0")),
    // Solo un canceled sin cobro en Stripe puede llevar otra moneda (la de su factura).
    check(
      "family_collection_attempts_currency_check",
      sql.raw("currency = 'EUR' or (status = 'canceled' and provider_payment_intent_reference is null)")
    ),
    check(
      "family_collection_attempts_status_check",
      sql.raw("status in ('claimed', 'created', 'processing', 'requires_action', 'succeeded', 'failed', 'canceled')")
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
        "(status not in ('created', 'processing', 'requires_action', 'succeeded') or provider_payment_intent_reference is not null) and (status <> 'claimed' or provider_payment_intent_reference is null)"
      )
    ),
    // Fase 4: confirmar con el banco solo con tarjeta y siempre con plazo.
    check(
      "family_collection_attempts_action_deadline_check",
      sql.raw("status <> 'requires_action' or (action_deadline_at is not null and payment_method_kind = 'card')")
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
    // Reintento solo de tarjeta y solo tras los intentos 1 a 3 (D1: el 4 es el último).
    // `is not distinct from`: un tipo de pago nulo tampoco deja pasar un reintento.
    check(
      "family_collection_attempts_next_retry_card_only",
      sql.raw("next_retry_at is null or (payment_method_kind is not distinct from 'card' and attempt_number <= 3)")
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

/**
 * Estados de una disputa de Stripe (`dispute.status`), tal cual. Fase 4.
 */
export const FAMILY_COLLECTION_DISPUTE_STATUSES = [
  "warning_needs_response",
  "warning_under_review",
  "warning_closed",
  "needs_response",
  "under_review",
  "won",
  "lost",
  "prevented",
] as const;
export type FamilyCollectionDisputeStatus = (typeof FAMILY_COLLECTION_DISPUTE_STATUSES)[number];

/** Estados cerrados: exactamente los que llevan `closed_at` (check de la base). */
export const FAMILY_COLLECTION_DISPUTE_CLOSED_STATUSES = ["won", "lost", "warning_closed", "prevented"] as const;

/**
 * Disputas de un cobro automático (Fase 4). Una por `dp_…`/`du_…` y academia.
 * El intento y el pago en restrict: nunca se borra un pago ni su rastro. El
 * último evento que la tocó pasa a null si se borra el evento (solo esa
 * columna en el candidato). Solo existe con la forma "phase4".
 */
export const familyCollectionDisputes = zaltyko.table(
  "family_collection_disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").notNull(),
    paymentId: uuid("payment_id").notNull(),
    // dp_… (tarjeta) o du_… ; nunca el contenido de la disputa.
    providerDisputeReference: text("provider_dispute_reference").notNull(),
    // ch_… (tarjeta) o py_… (domiciliación).
    providerChargeReference: text("provider_charge_reference").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").$type<FamilyCollectionDisputeStatus>().notNull(),
    reasonCode: text("reason_code"),
    evidenceDueAt: timestamp("evidence_due_at", { withTimezone: true }),
    fundsWithdrawn: boolean("funds_withdrawn").notNull().default(false),
    // Cuándo se escribieron las filas de devolución en zaltyko.refunds.
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lastProviderEventId: uuid("last_provider_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("family_collection_disputes_reference_uq").on(table.organizationId, table.providerDisputeReference),
    index("family_collection_disputes_status_idx").on(table.organizationId, table.status, table.updatedAt),
    index("family_collection_disputes_attempt_idx").on(table.organizationId, table.attemptId),
    index("family_collection_disputes_event_idx").on(table.organizationId, table.lastProviderEventId),
    check(
      "family_collection_disputes_reference_format",
      sql.raw(
        "char_length(provider_dispute_reference) <= 255 and provider_dispute_reference ~ '^(dp|du)_[A-Za-z0-9_]+$'"
      )
    ),
    check(
      "family_collection_disputes_charge_reference_format",
      sql.raw(
        "char_length(provider_charge_reference) <= 255 and provider_charge_reference ~ '^(ch|py)_[A-Za-z0-9_]+$'"
      )
    ),
    check("family_collection_disputes_amount_check", sql.raw("amount_cents > 0")),
    check("family_collection_disputes_currency_check", sql.raw("currency = 'EUR'")),
    check(
      "family_collection_disputes_status_check",
      sql.raw(
        "status in ('warning_needs_response', 'warning_under_review', 'warning_closed', 'needs_response', 'under_review', 'won', 'lost', 'prevented')"
      )
    ),
    check(
      "family_collection_disputes_reason_code_format",
      sql.raw("reason_code is null or reason_code ~ '^[a-z0-9_]{1,64}$'")
    ),
    check(
      "family_collection_disputes_closed_iff_final",
      sql.raw("(status in ('won', 'lost', 'warning_closed', 'prevented')) = (closed_at is not null)")
    ),
    foreignKey({
      name: "family_collection_disputes_attempt_fk",
      columns: [table.organizationId, table.attemptId],
      foreignColumns: [familyCollectionAttempts.organizationId, familyCollectionAttempts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_collection_disputes_payment_fk",
      columns: [table.organizationId, table.paymentId, table.currency],
      foreignColumns: [payments.organizationId, payments.id, payments.currency],
    }).onDelete("restrict"),
    foreignKey({
      name: "family_collection_disputes_last_event_fk",
      columns: [table.organizationId, table.lastProviderEventId],
      foreignColumns: [paymentProviderEvents.organizationId, paymentProviderEvents.id],
    }).onDelete("set null"),
  ]
);

export type FamilyCollectionAttemptRow = typeof familyCollectionAttempts.$inferSelect;
export type FamilyCollectionAttemptChargeRow = typeof familyCollectionAttemptCharges.$inferSelect;
export type OrganizationCollectionSettingsRow = typeof organizationCollectionSettings.$inferSelect;
export type FamilyCollectionDisputeRow = typeof familyCollectionDisputes.$inferSelect;
