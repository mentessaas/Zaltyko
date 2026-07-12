import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";

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
 * Registra un evento de billing en la base de datos
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

  await db
    .update(billingEvents)
    .set({
      status: "processing",
      attemptCount: sql`${billingEvents.attemptCount} + 1`,
      errorMessage: null,
      payload: event as unknown as Record<string, unknown>,
      lastAttemptAt: now,
    })
    .where(eq(billingEvents.id, existing.id));

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
