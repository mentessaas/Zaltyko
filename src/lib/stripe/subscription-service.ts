import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { subscriptions, billingEvents } from "@/db/schema";
import { withTransaction } from "@/lib/db-transactions";
import { extractMetadataValue } from "@/lib/stripe/metadata-utils";
import { getAcademyContextFromSubscription } from "@/lib/stripe/context-resolver";
import { getPlanIdByStripePrice } from "@/lib/stripe/plan-service";
import { unixToDate } from "@/lib/stripe/date-utils";
import type { WebhookContext } from "@/lib/stripe/webhook-handler";
import { convertAcademyTrial } from "@/lib/billing/trial-service";
import { shouldApplyStripeEvent } from "@/lib/stripe/event-policy";
import { getStripeClient } from "@/lib/stripe/client";

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Actualiza el registro de suscripción en la base de datos
 */
export async function updateSubscriptionRecord(
  subscription: Stripe.Subscription,
  userId: string,
  event: Stripe.Event,
  client: TransactionClient | typeof db = db
): Promise<"updated" | "stale_ignored"> {

  if ("execute" in client && typeof client.execute === "function") {
    await client.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
  }

  const eventCreatedAt = typeof event.created === "number" ? new Date(event.created * 1000) : new Date();
  const [existing] = await client
    .select({ lastStripeEventCreatedAt: subscriptions.lastStripeEventCreatedAt })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!shouldApplyStripeEvent(existing?.lastStripeEventCreatedAt ?? null, eventCreatedAt)) {
    return "stale_ignored";
  }

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
  const currentPeriodEnd = unixToDate(subscription.items?.data?.[0]?.current_period_end);

  await client
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
      lastStripeEventId: event.id,
      lastStripeEventCreatedAt: eventCreatedAt,
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
        lastStripeEventId: event.id,
        lastStripeEventCreatedAt: eventCreatedAt,
        updatedAt: new Date(),
      },
    });

  return "updated";
}

/**
 * Maneja eventos relacionados con suscripciones
 */
export async function handleSubscriptionEvent(
  eventType: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted",
  subscription: Stripe.Subscription,
  eventId: string,
  event: Stripe.Event
): Promise<WebhookContext> {
  // Stripe no garantiza el orden de entrega. Para created/updated aplicamos el
  // snapshot actual del objeto remoto; así dos eventos creados en el mismo
  // segundo tampoco pueden restaurar un estado antiguo. Deleted ya contiene el
  // estado terminal y se procesa sin una lectura remota adicional.
  const canonicalSubscription =
    eventType === "customer.subscription.deleted"
      ? subscription
      : await getStripeClient().subscriptions.retrieve(subscription.id);

  return await withTransaction(async (tx) => {
    const context = await getAcademyContextFromSubscription(canonicalSubscription);

    if (context.userId) {
      await updateSubscriptionRecord(canonicalSubscription, context.userId, event, tx);
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

    if (context.academyId && ["active", "trialing"].includes(canonicalSubscription.status)) {
      await convertAcademyTrial(context.academyId, new Date(), tx);
    }

    return context;
  });
}
