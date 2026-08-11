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
 * Registra un evento de billing en la base de datos.
 *
 * Comparte la deduplicacion de Stripe (stripeEventId UNIQUE) y ademas usa
 * compare-and-swap sobre (status, lastAttemptAt) observados para evitar que
 * dos reclaimers obtengan shouldProcess=true sobre el mismo evento: el
 * primero gana via RETURNING, el segundo ve 0 filas y se reporta como
 * shouldProcess=false.
 */
export async function recordBillingEvent(event: Stripe.Event): Promise<BillingEventClaim> {
  const stripeObject = event.data.object as { id?: string };
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
      payload: event as unknown as Record<string, unknown>,
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
  // fila se acaba de crear y todavia no se ha persistido el valor, el CAS
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
      payload: event as unknown as Record<string, unknown>,
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
