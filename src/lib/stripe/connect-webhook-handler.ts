import { NextResponse } from "next/server";
import Stripe from "stripe";

import { getStripeClient } from "@/lib/stripe/client";
import { logger } from "@/lib/logger";
import { recordBillingEvent, updateBillingEventStatus } from "@/lib/stripe/billing-events-service";
import { syncConnectAccountFromStripe } from "@/lib/stripe/connect-service";

/**
 * Webhook de cuentas conectadas (Stripe Connect).
 *
 * A diferencia del webhook de plataforma (`/api/stripe/webhook`, suscripciones
 * SaaS), este recibe eventos de las cuentas conectadas de las academias
 * (account.updated y, desde FASE 5, payment_intent.* / charge.refunded).
 * Usa su propio secret de firma y reutiliza `billing_events` para idempotencia.
 */

/**
 * Procesa un evento de Connect ya verificado. Extensible: FASE 5 añade
 * payment_intent.succeeded/payment_failed/canceled y charge.refunded.
 */
export async function processConnectEvent(event: Stripe.Event): Promise<{ duplicate: boolean }> {
  const claim = await recordBillingEvent(event);
  if (!claim.shouldProcess) {
    return { duplicate: true };
  }

  const eventId = claim.id;
  try {
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      await syncConnectAccountFromStripe(account);
      await updateBillingEventStatus(eventId, { status: "processed", processedAt: new Date() });
    } else {
      // Otros tipos aún no manejados (FASE 5): marcar como procesado para no
      // reintentar en bucle.
      await updateBillingEventStatus(eventId, { status: "processed", processedAt: new Date() });
    }
    return { duplicate: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Stripe connect webhook processing error", error, {
      eventId,
      eventType: event.type,
    });
    await updateBillingEventStatus(eventId, { status: "error", errorMessage });
    throw error;
  }
}

export async function handleConnectWebhook(request: Request): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("Stripe connect webhook secret not configured");
    return NextResponse.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  if (!signature) {
    return NextResponse.json({ error: "SIGNATURE_VERIFICATION_FAILED" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Stripe connect signature verification failed", error, { errorMessage });
    return NextResponse.json({ error: "SIGNATURE_VERIFICATION_FAILED" }, { status: 400 });
  }

  try {
    const result = await processConnectEvent(event);
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Stripe connect webhook handler error", error);
    return NextResponse.json({ error: "PROCESSING_FAILED", message: errorMessage }, { status: 500 });
  }
}
