import Stripe from "stripe";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, billingEvents, profiles, subscriptions } from "@/db/schema";
import { withTransaction } from "@/lib/db-transactions";
import { lockAcademyOperationalWrites, lockUserSubscriptionStatus } from "@/lib/limits";
import { extractMetadataValue } from "@/lib/stripe/metadata-utils";
import { getAcademyContextFromSubscription } from "@/lib/stripe/context-resolver";
import { getPlanIdByStripePrice } from "@/lib/stripe/plan-service";
import { unixToDate } from "@/lib/stripe/date-utils";
import type { WebhookContext } from "@/lib/stripe/webhook-handler";
import { convertAcademyTrial } from "@/lib/billing/trial-service";
import { shouldApplyStripeEvent } from "@/lib/stripe/event-policy";
import { getStripeClient } from "@/lib/stripe/client";
import { toCommercialPlanSlug } from "@/lib/growth/contracts";
import { recordGrowthEvent } from "@/lib/growth/events";

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * A plan/status webhook changes the effective capacity of every legacy
 * academy owned by the subscriber. Use the same academy locks as operational
 * writes so a downgrade cannot race a resource creation on another academy.
 */
async function lockSubscriptionAcademies(
  tx: TransactionClient,
  context: { academyId: string | null; userId: string | null }
): Promise<void> {
  const academyIds = new Set<string>();

  if (context.userId) {
    const [owner] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, context.userId))
      .limit(1);

    if (owner) {
      const ownedAcademies = await tx
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.ownerId, owner.id))
        .orderBy(asc(academies.id));
      for (const academy of ownedAcademies) academyIds.add(academy.id);
    }
  }

  if (context.academyId) academyIds.add(context.academyId);

  for (const academyId of [...academyIds].sort()) {
    await lockAcademyOperationalWrites(tx, academyId);
  }
}

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
    await lockUserSubscriptionStatus(client, userId);
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

  const result = await withTransaction(async (tx) => {
    const context = await getAcademyContextFromSubscription(canonicalSubscription, tx);

    // Serialize effective plan/status changes against all capacity-guarded
    // operations before persisting the subscription snapshot.
    await lockSubscriptionAcademies(tx, context);

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

    const trialConverted =
      context.academyId && ["active", "trialing"].includes(canonicalSubscription.status)
        ? await convertAcademyTrial(context.academyId, new Date(), tx)
        : false;

    return { context, trialConverted };
  });
  const { context, trialConverted } = result;

  const planCode =
    extractMetadataValue(canonicalSubscription.metadata, "planCode") ??
    extractMetadataValue(canonicalSubscription.metadata, "plan_code");
  const eventName =
    eventType === "customer.subscription.deleted"
      ? "subscription_cancelled"
      : ["active", "trialing"].includes(canonicalSubscription.status)
        ? "subscription_activated"
        : null;

  if (eventName) {
    await recordGrowthEvent({
      eventName,
      userId: context.userId,
      academyId: context.academyId,
      tenantId: context.tenantId,
      planCode: toCommercialPlanSlug(planCode),
      source: "stripe_webhook",
      properties: { subscription_status: canonicalSubscription.status },
      idempotencyKey: `stripe_event:${event.id}`,
    });
  }

  if (trialConverted) {
    await recordGrowthEvent({
      eventName: "trial_converted",
      userId: context.userId,
      academyId: context.academyId,
      tenantId: context.tenantId,
      planCode: toCommercialPlanSlug(planCode),
      source: "stripe_webhook",
      idempotencyKey: `trial_converted:${event.id}`,
    });
  }

  return context;
}
