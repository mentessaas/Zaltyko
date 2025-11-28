import Stripe from "stripe";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { billingEvents } from "@/db/schema";

export interface BillingEventUpdate {
  status?: "processing" | "processed" | "error";
  academyId?: string;
  tenantId?: string;
  processedAt?: Date | null;
  errorMessage?: string | null;
}

/**
 * Registra un evento de billing en la base de datos
 */
export async function recordBillingEvent(event: Stripe.Event): Promise<string> {
  const [eventRow] = await db
    .insert(billingEvents)
    .values({
      stripeEventId: event.id,
      type: event.type,
      status: "processing",
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: billingEvents.stripeEventId,
      set: {
        type: event.type,
        status: "processing",
        errorMessage: null,
        payload: event as unknown as Record<string, unknown>,
        processedAt: null,
      },
    })
    .returning({ id: billingEvents.id });

  return eventRow.id;
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

