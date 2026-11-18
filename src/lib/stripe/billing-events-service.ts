import Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { billingEvents } from "@/db/schema";
import { canRetryBillingEvent } from "@/lib/stripe/event-policy";

export interface BillingEventUpdate {
  status?: "processing" | "processed" | "error";
  academyId?: string;
  tenantId?: string;
  processedAt?: Date | null;
  errorMessage?: string | null;
}

export interface BillingEventClaim {
  id: string;
  shouldProcess: boolean;
  previousStatus: string | null;
}

/**
 * Qué se guarda en `billing_events.payload`:
 * - "full": el evento entero, como hasta ahora (webhook de la suscripción de
 *   la plataforma).
 * - "minimal": solo lo necesario para reconocer el evento, sin datos de quien
 *   paga (webhook antiguo de cuentas conectadas).
 */
export type BillingEventPayloadMode = "full" | "minimal";

export interface RecordBillingEventOptions {
  payload: BillingEventPayloadMode;
}

/**
 * Resumen del evento sin datos personales: identificadores, tipo, cuenta,
 * modo, fecha y el id y la clase del objeto. Nunca nombres, correos,
 * direcciones, teléfonos ni datos de la tarjeta o la cuenta bancaria.
 */
export function minimalBillingEventPayload(event: Stripe.Event): Record<string, unknown> {
  const stripeObject = (event.data?.object ?? {}) as { id?: unknown; object?: unknown };
  return {
    id: event.id,
    type: event.type,
    account: event.account ?? null,
    livemode: event.livemode,
    created: event.created,
    data: {
      object: {
        id: typeof stripeObject.id === "string" ? stripeObject.id : null,
        object: typeof stripeObject.object === "string" ? stripeObject.object : null,
      },
    },
  };
}

function billingEventPayload(
  event: Stripe.Event,
  mode: BillingEventPayloadMode
): Record<string, unknown> {
  return mode === "minimal"
    ? minimalBillingEventPayload(event)
    : (event as unknown as Record<string, unknown>);
}

/**
 * Registra un evento de billing en la base de datos.
 *
 * Comparte la deduplicacion de Stripe (stripeEventId UNIQUE) y ademas usa
 * compare-and-swap sobre (status, lastAttemptAt) observados para evitar que
 * dos reclaimers obtengan shouldProcess=true sobre el mismo evento: el
 * primero gana via RETURNING, el segundo ve 0 filas y se reporta como
 * shouldProcess=false.
 *
 * `options.payload` decide qué se guarda (por defecto "full"). El mismo valor
 * se usa al crear la fila y al reclamarla en un reintento: si no, el primer
 * reenvío de Stripe volvería a guardar el evento entero.
 */
export async function recordBillingEvent(
  event: Stripe.Event,
  options: RecordBillingEventOptions = { payload: "full" }
): Promise<BillingEventClaim> {
  const stripeObject = event.data.object as { id?: string };
  const payload = billingEventPayload(event, options.payload);
  const now = new Date();
  const [created] = await db
    .insert(billingEvents)
    .values({
      stripeEventId: event.id,
      type: event.type,
      status: "processing",
      attemptCount: 1,
      stripeCreatedAt: typeof event.created === "number" ? new Date(event.created * 1000) : now,
      stripeObjectId: stripeObject.id ?? null,
      livemode: event.livemode,
      lastAttemptAt: now,
      payload,
    })
    .onConflictDoNothing({ target: billingEvents.stripeEventId })
    .returning({ id: billingEvents.id });

  if (created) {
    return { id: created.id, shouldProcess: true, previousStatus: null };
  }

  const [existing] = await db
    .select({
      id: billingEvents.id,
      status: billingEvents.status,
      lastAttemptAt: billingEvents.lastAttemptAt,
    })
    .from(billingEvents)
    .where(eq(billingEvents.stripeEventId, event.id))
    .limit(1);

  if (!existing) {
    throw new Error(`BILLING_EVENT_CLAIM_FAILED:${event.id}`);
  }

  const canRetry = canRetryBillingEvent({
    status: existing.status,
    lastAttemptAt: existing.lastAttemptAt,
    now,
  });

  if (!canRetry) {
    return { id: existing.id, shouldProcess: false, previousStatus: existing.status };
  }

  // Compare-and-swap: el WHERE fija la tupla observada (status +
  // lastAttemptAt). Si otro worker ya reclamo el lease y avanzo a
  // 'processing' (o cambio lastAttemptAt), esta transicion no aplica y
  // RETURNING devuelve 0 filas. Asi garantizamos que solo UN reclaimer
  // obtiene shouldProcess=true.
  //
  // Se acepta `lastAttemptAt` potencialmente null en el row leido: si la
  // fila se acaba de crear y todavía no se ha persistido el valor, el CAS
  // hace `lastAttemptAt IS NULL` para no perder la transicion.
  const lastAttemptAtMatch =
    existing.lastAttemptAt === null
      ? sql`${billingEvents.lastAttemptAt} IS NULL`
      : eq(billingEvents.lastAttemptAt, existing.lastAttemptAt);

  const claimed = await db
    .update(billingEvents)
    .set({
      status: "processing",
      attemptCount: sql`${billingEvents.attemptCount} + 1`,
      errorMessage: null,
      payload,
      lastAttemptAt: now,
    })
    .where(
      and(
        eq(billingEvents.id, existing.id),
        eq(billingEvents.status, existing.status),
        lastAttemptAtMatch
      )
    )
    .returning({ id: billingEvents.id });

  if (claimed.length === 0) {
    return { id: existing.id, shouldProcess: false, previousStatus: existing.status };
  }

  return { id: existing.id, shouldProcess: true, previousStatus: existing.status };
}

/**
 * Actualiza el estado de un evento de billing
 */
export async function updateBillingEventStatus(
  eventId: string,
  update: BillingEventUpdate
): Promise<void> {
  await db
    .update(billingEvents)
    .set(update)
    .where(eq(billingEvents.id, eventId));
}
