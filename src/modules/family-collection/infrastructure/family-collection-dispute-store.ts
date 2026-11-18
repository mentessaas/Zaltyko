/**
 * Cobro automático de cuotas (Fase 4, Tarea 7): acceso a la base de las
 * disputas de tarjeta y las devoluciones del banco en domiciliación.
 *
 * Toca la tabla `zaltyko.family_collection_disputes` de la candidata
 * docs/deployment/candidates/20261118120000_family_collection_events_candidate.sql
 * (sin aplicar): solo debe usarse después de `isStorageAvailable()`.
 *
 * Reglas que cumple cada escritura:
 * - una transacción corta, sin Stripe dentro (lo que dice Stripe llega ya
 *   releído en `DisputeSnapshot`);
 * - orden de bloqueo único: academia → cuotas del intento por id → factura
 *   → intento → disputa → pago (C18);
 * - nunca se borra ni se cambia un pago ni un reparto: una disputa perdida
 *   escribe filas en zaltyko.refunds por el mismo camino que las devoluciones
 *   (recordSplitRefund), una por reparto, con referencia `{dp_…}:{reparto}` y
 *   clave `refund:{dp_…}:{reparto}`;
 * - solo ids, referencias opacas (`dp_…`, `du_…`, `ch_…`, `py_…`), importes,
 *   estados y códigos en la base y el outbox.
 */
import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  FAMILY_COLLECTION_PROCESSOR,
  issueSystemManualInvoiceInTransaction,
} from "@/modules/billing/application/ledger-service";
import {
  isFamilyCollectionEventsStorageAvailable,
  isFamilyCollectionStorageAvailable,
} from "@/modules/family-collection/application/storage";
import {
  DISPUTE_LOST_NOTICE_REASON,
  DISPUTE_OPENED_REASON,
  DISPUTE_REINSTATED_REASON,
  DISPUTE_UNALLOCATED_REASON,
  DISPUTE_WON_REASON,
  disputeEffect,
  disputeReversalReason,
  isFinalDisputeStatus,
  RETURNED_FEE_LINE_TYPE,
  returnedFeeInvoiceKey,
  SEPA_RETURNED_NOTICE_REASON,
  type DisputeEffect,
  type DisputePaymentMethodKind,
} from "@/modules/family-collection/domain/dispute-effect";
import { RefundDoesNotFitError } from "@/modules/family-collection/domain/refund-split";
import {
  attemptColumns,
  findAttemptByPaymentIntentIn,
  ledgerEnvironmentOf,
  lockAttemptCharges,
  lockInvoice,
  NEEDS_REVIEW_EVENT,
  needsReviewKey,
  recordSplitRefund,
  toAttempt,
  type CollectionAttempt,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import type { DisputeSnapshot } from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import { lockOrganizationForSaasMutation } from "@/modules/saas-billing/application/entitlement-service";
import { appendOutboxEvent, findOutboxEvent } from "@/modules/shared/infrastructure/transactional-records";

/** Lo que dejó una disputa en la base. */
export type DisputeApplyResult =
  | {
      outcome: "applied";
      /** Fila de zaltyko.family_collection_disputes. */
      disputeId: string;
      effect: DisputeEffect;
      /** Se escribieron ahora las filas de la reversión (y `reversed_at`). */
      reversed: boolean;
      /** `dispute_unallocated` si la reversión no cabía en lo repartido: la disputa se guardó sin filas. */
      review: typeof DISPUTE_UNALLOCATED_REASON | null;
      /** Filas nuevas en zaltyko.refunds (la primera es el efecto del buzón). */
      refundIds: string[];
      /** Factura de la cuota nueva de una domiciliación devuelta (D2), si se creó ahora o ya existía. */
      returnedInvoiceId: string | null;
    }
  /** El intento no está cobrado con ese `pi_…` (o no tiene pago): no hay dónde guardar la disputa. */
  | { outcome: "not_collected" }
  /** La moneda de la disputa no es la del pago: no se guarda nada (lo avisa quien llama). */
  | { outcome: "currency_mismatch" };

export interface FamilyCollectionDisputeStore {
  /** Almacenamiento de las Fases 1–3 y forma "phase4" (la tabla de disputas). */
  isStorageAvailable(): Promise<boolean>;
  /** El intento de esa academia con ese `pi_…`, o null. Sin transacción. */
  findAttemptByPaymentIntent(input: { organizationId: string; paymentIntentId: string }): Promise<CollectionAttempt | null>;
  /**
   * Una transacción con el orden único (academia → cuotas → factura → intento
   * → disputa → pago): guarda la disputa (una fila por `dp_…`, siempre con lo
   * último que dice Stripe) y aplica su efecto (disputeEffect, decidido con la
   * fila ya bloqueada):
   * - `track`: nada en el libro; aviso `dispute_opened` con el plazo;
   * - `close`: nada en el libro; aviso `dispute_won` (o `dispute_reinstated`
   *   si ya estaba revertida);
   * - `reverse`: filas `dispute_lost` (tarjeta) o `sepa_returned`
   *   (domiciliación) por reparto y `reversed_at`; en domiciliación, además, la
   *   cuota nueva pendiente (issueReturnedFeeInvoice, D2). Aviso
   *   `dispute_lost` o `sepa_returned`.
   * Si la reversión no cabe en lo repartido, se deshace entera y se repite sin
   * ella: la disputa queda guardada (estado y plazo) sin filas, sin
   * `reversed_at` ni cuota nueva, con el aviso `dispute_unallocated` (una vez
   * por `dp_…`). Idempotente por el `dp_…`, por `reversed_at` y por la clave
   * de cada fila.
   */
  upsertDisputeAndApply(input: DisputeApplyInput): Promise<DisputeApplyResult>;
  /**
   * Aviso de una disputa sin fila (el cobro no está en el libro o la moneda no
   * cuadra), una vez por intento, motivo y `dp_…`. `true` si lo escribió.
   */
  recordDisputeNotice(input: DisputeNoticeInput): Promise<boolean>;
}

export interface DisputeApplyInput {
  organizationId: string;
  attemptId: string;
  /** `pi_…` del cargo disputado: tiene que ser el del intento. */
  paymentIntentId: string;
  dispute: DisputeSnapshot;
  /** Forma de pago: la del cargo según Stripe o, si no la da, la del intento. */
  paymentMethodKind: DisputePaymentMethodKind;
  /** Fila del buzón del evento (`last_provider_event_id` y `refunds.provider_event_id`). */
  providerEventInboxId: string | null;
  environment: "test" | "live";
  now: Date;
}

export interface DisputeNoticeInput {
  attempt: CollectionAttempt;
  reason: string;
  disputeId: string;
  amountCents: number;
  currency: string;
  now: Date;
  evidenceDueAt?: Date | null;
  returnedInvoiceId?: string | null;
}

/** Aviso de una disputa (clave con su `dp_…`, C13), dentro de la transacción de quien llama. */
async function appendDisputeNotice(tx: TransactionClient, input: DisputeNoticeInput): Promise<boolean> {
  const eventName = NEEDS_REVIEW_EVENT;
  const idempotencyKey = needsReviewKey({
    attemptId: input.attempt.id,
    invoiceId: input.attempt.invoiceId,
    reason: input.reason,
    reference: input.disputeId,
  });
  if (await findOutboxEvent(tx, { organizationId: input.attempt.organizationId, eventName, idempotencyKey })) {
    return false;
  }
  // Solo ids, la referencia opaca de Stripe, el importe, la moneda y fechas.
  await appendOutboxEvent(tx, {
    organizationId: input.attempt.organizationId,
    locationId: input.attempt.locationId,
    eventName,
    aggregateType: "family_collection_attempt",
    aggregateId: input.attempt.id,
    idempotencyKey,
    payload: {
      attemptId: input.attempt.id,
      invoiceId: input.attempt.invoiceId,
      reason: input.reason,
      providerDisputeReference: input.disputeId,
      amountCents: input.amountCents,
      currency: input.currency,
      ...(input.evidenceDueAt ? { evidenceDueAt: input.evidenceDueAt.toISOString() } : {}),
      ...(input.returnedInvoiceId ? { returnedInvoiceId: input.returnedInvoiceId } : {}),
    },
    occurredAt: input.now,
  });
  return true;
}

/** Referencia de la factura nueva: `DEVUELTA-{dp_…}` (o su huella si no cabe en 80). */
function returnedFeeReference(disputeId: string): string {
  const plain = `DEVUELTA-${disputeId}`;
  if (plain.length <= 80) return plain;
  return `DEVUELTA-${createHash("sha256").update(disputeId).digest("hex").slice(0, 40)}`;
}

/**
 * D2: la cuota nueva de una domiciliación devuelta por el banco. Una factura
 * manual (nunca automática: se cobra a mano, con los recordatorios de
 * siempre) para la misma familia, persona pagadora y sede que la factura
 * original, con una línea «devuelta por el banco» por cada fila
 * `sepa_returned` de la disputa (importe y periodo de su cuota). Clave
 * `family-collection-return:{dp_…}`: una sola vez aunque se repita.
 *
 * Solo dentro de la transacción de upsertDisputeAndApply, después de escribir
 * las filas de la reversión. Nunca para una disputa de tarjeta (D3).
 */
export async function issueReturnedFeeInvoice(
  tx: TransactionClient,
  input: {
    organizationId: string;
    disputeId: string;
    /** Factura original del intento: familia, persona pagadora y sede. */
    sourceInvoiceId: string;
    environment: "test" | "live";
    now: Date;
  }
): Promise<{ invoiceId: string; created: boolean }> {
  const idempotencyKey = returnedFeeInvoiceKey(input.disputeId);
  const prior = await findOutboxEvent(tx, {
    organizationId: input.organizationId,
    eventName: "invoice.issued",
    idempotencyKey,
  });
  const source = await tx.execute(sql`
    select location_id::text as "locationId",
           family_id::text as "familyId",
           family_payer_id::text as "familyPayerId",
           currency as "currency"
      from zaltyko.invoices
     where organization_id = ${input.organizationId}::uuid and id = ${input.sourceInvoiceId}::uuid
  `);
  const invoice = source.rows[0] as Record<string, unknown> | undefined;
  if (!invoice) throw new Error("FAMILY_COLLECTION_RETURNED_FEE_SOURCE_MISSING");
  const rows = await tx.execute(sql`
    select r.amount_cents::text as "amountCents",
           c.service_period_start::text as "servicePeriodStart",
           c.service_period_end::text as "servicePeriodEnd"
      from zaltyko.refunds r
      join zaltyko.payment_allocations pa
        on pa.organization_id = r.organization_id and pa.id = r.payment_allocation_id
      join zaltyko.charges c
        on c.organization_id = pa.organization_id and c.id = pa.charge_id
     where r.organization_id = ${input.organizationId}::uuid
       and r.processor = ${FAMILY_COLLECTION_PROCESSOR}
       and r.environment = ${ledgerEnvironmentOf(input.environment)}::zaltyko.provider_environment
       and starts_with(r.provider_refund_id, ${`${input.disputeId}:`})
       and r.status = 'succeeded'
     order by c.service_period_start, c.id, r.id
  `);
  const lines = (rows.rows as Array<Record<string, unknown>>).map((row) => ({
    lineType: RETURNED_FEE_LINE_TYPE,
    quantity: 1,
    unitAmountCents: Number(row.amountCents),
    servicePeriodStart: String(row.servicePeriodStart),
    servicePeriodEnd: String(row.servicePeriodEnd),
  }));
  if (lines.length === 0) throw new Error("FAMILY_COLLECTION_RETURNED_FEE_WITHOUT_ROWS");
  const familyPayerId = typeof invoice.familyPayerId === "string" ? invoice.familyPayerId : undefined;
  const issued = await issueSystemManualInvoiceInTransaction(tx, {
    organizationId: input.organizationId,
    locationId: String(invoice.locationId),
    familyId: String(invoice.familyId),
    ...(familyPayerId ? { familyPayerId } : {}),
    reference: returnedFeeReference(input.disputeId),
    currency: String(invoice.currency),
    // Vence ya: los recordatorios la tratan como cualquier cuota a mano.
    dueAt: input.now.toISOString(),
    lines,
    idempotencyKey,
  });
  return { invoiceId: issued.id, created: prior === null };
}

interface LockedDispute {
  id: string;
  status: string;
  reversedAt: Date | null;
}

/**
 * Lo que hace la transacción. Con `reverse: false` (segunda pasada, la
 * reversión no cabía) guarda la disputa sin tocar el libro y deja el aviso
 * `dispute_unallocated`.
 */
async function applyDispute(
  tx: TransactionClient,
  input: DisputeApplyInput,
  options: { reverse: boolean }
): Promise<DisputeApplyResult> {
  const { dispute } = input;
  const found = await tx.execute(sql`
    select invoice_id::text as "invoiceId"
      from zaltyko.family_collection_attempts
     where organization_id = ${input.organizationId}::uuid and id = ${input.attemptId}::uuid
  `);
  const invoiceId = (found.rows[0] as { invoiceId?: unknown } | undefined)?.invoiceId;
  if (typeof invoiceId !== "string") return { outcome: "not_collected" };

  // Orden único (C18): academia → cuotas por id → factura → intento → disputa → pago.
  await lockOrganizationForSaasMutation(tx, input.organizationId);
  await lockAttemptCharges(tx, input.organizationId, input.attemptId);
  await lockInvoice(tx, input.organizationId, invoiceId);
  const locked = await tx.execute(sql`
    select ${attemptColumns}, payment_id::text as "paymentId"
      from zaltyko.family_collection_attempts
     where organization_id = ${input.organizationId}::uuid
       and id = ${input.attemptId}::uuid
     for update
  `);
  const attemptRow = locked.rows[0] as Record<string, unknown> | undefined;
  if (!attemptRow) return { outcome: "not_collected" };
  const attempt = toAttempt(attemptRow);
  const paymentId = typeof attemptRow.paymentId === "string" ? attemptRow.paymentId : null;
  if (attempt.status !== "succeeded" || paymentId === null || attempt.paymentIntentId !== input.paymentIntentId) {
    return { outcome: "not_collected" };
  }
  const paymentRow = await tx.execute(sql`
    select currency from zaltyko.payments
     where organization_id = ${input.organizationId}::uuid and id = ${paymentId}::uuid
  `);
  const currency = (paymentRow.rows[0] as { currency?: unknown } | undefined)?.currency;
  if (typeof currency !== "string" || (dispute.currency ?? currency) !== currency) {
    return { outcome: "currency_mismatch" };
  }

  // Una fila por `dp_…`: la primera entrega la crea; todas la bloquean.
  const finalNow = isFinalDisputeStatus(dispute.status);
  await tx.execute(sql`
    insert into zaltyko.family_collection_disputes (
      organization_id, attempt_id, payment_id, provider_dispute_reference, provider_charge_reference,
      amount_cents, currency, status, reason_code, evidence_due_at, funds_withdrawn,
      opened_at, closed_at, last_provider_event_id, created_at, updated_at
    ) values (
      ${input.organizationId}::uuid, ${input.attemptId}::uuid, ${paymentId}::uuid, ${dispute.id}, ${dispute.chargeId},
      ${dispute.amountCents}, ${currency}, ${dispute.status}, ${dispute.reasonCode},
      ${dispute.evidenceDueAt ? dispute.evidenceDueAt.toISOString() : null}::timestamptz, ${dispute.fundsWithdrawn},
      ${dispute.createdAt.toISOString()}::timestamptz,
      ${finalNow ? input.now.toISOString() : null}::timestamptz,
      ${input.providerEventInboxId}::uuid,
      ${input.now.toISOString()}::timestamptz, ${input.now.toISOString()}::timestamptz
    )
    on conflict (organization_id, provider_dispute_reference) do nothing
  `);
  const disputeRow = await tx.execute(sql`
    select id::text as "id", status as "status", reversed_at as "reversedAt"
      from zaltyko.family_collection_disputes
     where organization_id = ${input.organizationId}::uuid
       and provider_dispute_reference = ${dispute.id}
     for update
  `);
  const row = disputeRow.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("FAMILY_COLLECTION_DISPUTE_ROW_MISSING");
  const stored: LockedDispute = {
    id: String(row.id),
    status: String(row.status),
    reversedAt: row.reversedAt === null || row.reversedAt === undefined ? null : new Date(String(row.reversedAt)),
  };
  // Último eslabón del orden: el pago (recordSplitRefund lo vuelve a pedir, ya es suyo).
  await tx.execute(sql`
    select id from zaltyko.payments
     where organization_id = ${input.organizationId}::uuid and id = ${paymentId}::uuid
     for update
  `);

  // Una lectura atrasada (otro evento leyó antes y escribe después) nunca
  // devuelve a abierta una disputa ya cerrada: se queda todo como estaba.
  const stale = isFinalDisputeStatus(stored.status) && !isFinalDisputeStatus(dispute.status);
  const status = stale ? stored.status : dispute.status;
  const alreadyReversed = stored.reversedAt !== null;
  const effect = disputeEffect({ status, paymentMethodKind: input.paymentMethodKind, alreadyReversed });

  let refundIds: string[] = [];
  let returnedInvoiceId: string | null = null;
  let reversedNow = false;
  if (effect === "reverse" && options.reverse) {
    // Si no cabe, lanza RefundDoesNotFitError y se deshace todo (también la fila de la disputa).
    const written = await recordSplitRefund(tx, {
      organizationId: input.organizationId,
      locationId: attempt.locationId,
      paymentId,
      reference: dispute.id,
      amountCents: dispute.amountCents,
      currency,
      reasonCode: disputeReversalReason(input.paymentMethodKind),
      refundedAt: input.now,
      providerEventId: input.providerEventInboxId,
      environment: input.environment,
      now: input.now,
    });
    refundIds = written.refundIds;
    reversedNow = true;
    // D2: solo en domiciliación; en tarjeta (D3) nunca hay cuota nueva.
    if (input.paymentMethodKind === "sepa_debit") {
      returnedInvoiceId = (
        await issueReturnedFeeInvoice(tx, {
          organizationId: input.organizationId,
          disputeId: dispute.id,
          sourceInvoiceId: invoiceId,
          environment: input.environment,
          now: input.now,
        })
      ).invoiceId;
    }
  }

  const closed = isFinalDisputeStatus(status);
  const fromStripe = stale
    ? sql``
    : sql`
           amount_cents = ${dispute.amountCents},
           reason_code = ${dispute.reasonCode},
           evidence_due_at = ${dispute.evidenceDueAt ? dispute.evidenceDueAt.toISOString() : null}::timestamptz,
           funds_withdrawn = ${dispute.fundsWithdrawn},`;
  await tx.execute(sql`
    update zaltyko.family_collection_disputes
       set status = ${status},${fromStripe}
           closed_at = ${closed ? sql`coalesce(closed_at, ${input.now.toISOString()}::timestamptz)` : sql`null`},
           reversed_at = ${reversedNow ? sql`coalesce(reversed_at, ${input.now.toISOString()}::timestamptz)` : sql`reversed_at`},
           last_provider_event_id = coalesce(${input.providerEventInboxId}::uuid, last_provider_event_id),
           updated_at = ${input.now.toISOString()}::timestamptz
     where organization_id = ${input.organizationId}::uuid and id = ${stored.id}::uuid
  `);

  const notice = (reason: string, extra: Partial<DisputeNoticeInput> = {}) =>
    appendDisputeNotice(tx, {
      attempt,
      reason,
      disputeId: dispute.id,
      amountCents: dispute.amountCents,
      currency,
      now: input.now,
      ...extra,
    });
  let review: typeof DISPUTE_UNALLOCATED_REASON | null = null;
  if (effect === "track") {
    // D4: la cuota sigue pagada; la academia ve el plazo. Nada a la familia.
    if (!alreadyReversed) await notice(DISPUTE_OPENED_REASON, { evidenceDueAt: dispute.evidenceDueAt });
  } else if (effect === "close") {
    // Ganada (`won`, `warning_closed`, `prevented`): si ya estaba revertida,
    // el libro no se toca y la academia lo revisa (`dispute_reinstated`).
    // Revertida y `lost`: el aviso de la pérdida ya se escribió al revertirla.
    if (status !== "lost") await notice(alreadyReversed ? DISPUTE_REINSTATED_REASON : DISPUTE_WON_REASON);
  } else if (reversedNow) {
    await notice(input.paymentMethodKind === "sepa_debit" ? SEPA_RETURNED_NOTICE_REASON : DISPUTE_LOST_NOTICE_REASON, {
      returnedInvoiceId,
    });
  } else {
    // No cabe en lo repartido: disputa guardada, sin filas ni cuota nueva.
    await notice(DISPUTE_UNALLOCATED_REASON);
    review = DISPUTE_UNALLOCATED_REASON;
  }

  return { outcome: "applied", disputeId: stored.id, effect, reversed: reversedNow, review, refundIds, returnedInvoiceId };
}

export function createFamilyCollectionDisputeStore(): FamilyCollectionDisputeStore {
  return {
    async isStorageAvailable() {
      const [collection, events, paymentMethods, connect] = await Promise.all([
        isFamilyCollectionStorageAvailable(db),
        isFamilyCollectionEventsStorageAvailable(db),
        isFamilyPaymentMethodsStorageAvailable(db),
        isConnectOnboardingStorageAvailable(db),
      ]);
      return collection && events && paymentMethods && connect;
    },

    async findAttemptByPaymentIntent(input) {
      return findAttemptByPaymentIntentIn(db, input);
    },

    async upsertDisputeAndApply(input) {
      try {
        return await db.transaction((tx) => applyDispute(tx, input, { reverse: true }));
      } catch (error) {
        if (!(error instanceof RefundDoesNotFitError)) throw error;
        // No cabe: se deshizo entera (ninguna fila). Se guarda la disputa sin reversión, con su aviso.
        return db.transaction((tx) => applyDispute(tx, input, { reverse: false }));
      }
    },

    async recordDisputeNotice(input) {
      return db.transaction((tx) => appendDisputeNotice(tx, input));
    },
  };
}
