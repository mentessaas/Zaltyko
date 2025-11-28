import Stripe from "stripe";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { subscriptions, billingEvents } from "@/db/schema";
import { withTransaction } from "@/lib/db-transactions";
import { extractMetadataValue } from "@/lib/stripe/metadata-utils";
import { getAcademyContextFromSubscription } from "@/lib/stripe/context-resolver";
import { getPlanIdByStripePrice } from "@/lib/stripe/plan-service";
import { unixToDate } from "@/lib/stripe/date-utils";
import type { WebhookContext } from "@/lib/stripe/webhook-handler";

/**
 * Actualiza el registro de suscripción en la base de datos
 */
export async function updateSubscriptionRecord(
  subscription: Stripe.Subscription,
  userId: string
): Promise<void> {

  const price = subscription.items?.data?.[0]?.price;
  const priceId = price?.id ?? null;
  const planCode =
    extractMetadataValue(subscription.metadata, "planCode") ??
    extractMetadataValue(subscription.metadata, "plan_code") ??
    null;

  const planId = await getPlanIdByStripePrice(priceId, planCode ?? undefined);

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  const status = subscription.status ?? "incomplete";
  const currentPeriodEnd = unixToDate(subscription.current_period_end);

  await db
    .insert(subscriptions)
    .values({
      userId,
      planId: planId ?? undefined,
      status,
      stripeCustomerId: stripeCustomerId ?? undefined,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId ?? undefined,
      cancelAtPeriodEnd,
      currentPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        planId: planId ?? undefined,
        status,
        stripeCustomerId: stripeCustomerId ?? undefined,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId ?? undefined,
        cancelAtPeriodEnd,
        currentPeriodEnd,
      },
    });
}

/**
 * Maneja eventos relacionados con suscripciones
 */
export async function handleSubscriptionEvent(
  eventType: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted",
  subscription: Stripe.Subscription,
  eventId: string
): Promise<WebhookContext> {
  return await withTransaction(async (tx) => {
    const context = await getAcademyContextFromSubscription(subscription);

    if (context.userId) {
      await updateSubscriptionRecord(subscription, context.userId);
    }

    // Actualizar estado del evento dentro de la transacción
    await tx
      .update(billingEvents)
      .set({
        status: "processed",
        academyId: context.academyId ?? undefined,
        tenantId: context.tenantId ?? undefined,
        processedAt: new Date(),
      })
      .where(eq(billingEvents.id, eventId));

    return context;
  });
}

