import { NextResponse } from "next/server";
import Stripe from "stripe";

import { getStripeClient } from "@/lib/stripe/client";
import { logger } from "@/lib/logger";
import { handleSubscriptionEvent } from "@/lib/stripe/subscription-service";
import { handleInvoiceEvent } from "@/lib/stripe/invoice-service";
import { recordBillingEvent, updateBillingEventStatus } from "@/lib/stripe/billing-events-service";

export interface WebhookContext {
  academyId: string | null;
  tenantId: string | null;
  userId: string | null;
}

/**
 * Verifica la firma del webhook de Stripe
 */
export function verifyWebhookSignature(
  body: string,
  signature: string | null,
  webhookSecret: string
): Stripe.Event {
  const stripe = getStripeClient();
  
  if (!signature) {
    throw new Error("Missing Stripe signature header");
  }

  try {
    return stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Stripe signature verification failed", error, {
      errorMessage,
    });
    throw new Error(`SIGNATURE_VERIFICATION_FAILED: ${errorMessage}`);
  }
}

/**
 * Procesa un evento de webhook de Stripe
 */
export async function processWebhookEvent(event: Stripe.Event): Promise<WebhookContext> {
  const eventId = await recordBillingEvent(event);

  try {
    let context: WebhookContext = {
      academyId: null,
      tenantId: null,
      userId: null,
    };

    // Procesar según el tipo de evento
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      context = await handleSubscriptionEvent(event.type, subscription, eventId);
    } else if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.payment_action_required" ||
      event.type === "invoice.finalized" ||
      event.type === "invoice.updated"
    ) {
      const invoice = event.data.object as Stripe.Invoice;
      context = await handleInvoiceEvent(event.type, invoice, eventId);
    } else {
      // Para otros tipos de eventos, solo marcar como procesado
      await updateBillingEventStatus(eventId, {
        status: "processed",
        processedAt: new Date(),
      });
    }

    return context;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Stripe webhook processing error", error, {
      eventId,
      eventType: event.type,
    });

    await updateBillingEventStatus(eventId, {
      status: "error",
      errorMessage,
    });

    throw error;
  }
}

/**
 * Handler principal del webhook de Stripe
 */
export async function handleStripeWebhook(request: Request): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error("Stripe webhook secret not configured");
    return NextResponse.json(
      { error: "WEBHOOK_NOT_CONFIGURED" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  try {
    // Verificar firma
    const event = verifyWebhookSignature(body, signature, webhookSecret);

    // Procesar evento
    const context = await processWebhookEvent(event);

    // Enviar notificaciones si es necesario (fuera de transacción)
    if (
      (event.type === "invoice.paid" ||
        event.type === "invoice.payment_failed" ||
        event.type === "invoice.payment_action_required") &&
      context.academyId &&
      context.tenantId
    ) {
      const invoice = event.data.object as Stripe.Invoice;
      await sendInvoiceNotifications(event.type, invoice, context);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("SIGNATURE_VERIFICATION_FAILED")) {
      return NextResponse.json(
        { error: "SIGNATURE_VERIFICATION_FAILED" },
        { status: 400 }
      );
    }

    logger.error("Stripe webhook handler error", error);
    return NextResponse.json(
      { error: "PROCESSING_FAILED", message: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * Envía notificaciones relacionadas con facturas
 */
async function sendInvoiceNotifications(
  eventType: "invoice.paid" | "invoice.payment_failed" | "invoice.payment_action_required",
  invoice: Stripe.Invoice,
  context: WebhookContext
): Promise<void> {
  try {
    const { sendInvoiceNotification } = await import("@/lib/stripe/notification-service");
    await sendInvoiceNotification(eventType, invoice, context);
  } catch (notificationError) {
    // Log error pero no fallar el webhook
    logger.error("Error sending notification in Stripe webhook", notificationError, {
      eventType,
      academyId: context.academyId,
      tenantId: context.tenantId,
    });
  }
}

