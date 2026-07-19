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

export interface WebhookProcessingResult {
  context: WebhookContext;
  duplicate: boolean;
  invoice?: Stripe.Invoice;
}

/**
 * Verifica la firma del webhook de Stripe
 */
export function verifyWebhookSignature(
  body: string,
  signature: string | null,
  webhookSecret: string
): Stripe.Event {
  if (!signature) {
    throw new Error("SIGNATURE_VERIFICATION_FAILED: Missing Stripe signature header");
  }

  const stripe = getStripeClient();

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
export async function processWebhookEvent(event: Stripe.Event): Promise<WebhookProcessingResult> {
  const claim = await recordBillingEvent(event);

  if (!claim.shouldProcess) {
    return {
      context: { academyId: null, tenantId: null, userId: null },
      duplicate: true,
    };
  }

  const eventId = claim.id;

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
      context = await handleSubscriptionEvent(event.type, subscription, eventId, event);
    } else if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.payment_action_required" ||
      event.type === "invoice.finalized" ||
      event.type === "invoice.updated"
    ) {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceResult = await handleInvoiceEvent(event.type, invoice, eventId);
      context = invoiceResult.context;
      return { context, duplicate: false, invoice: invoiceResult.invoice };
    } else {
      // Para otros tipos de eventos, solo marcar como procesado
      await updateBillingEventStatus(eventId, {
        status: "processed",
        processedAt: new Date(),
      });
    }

    return { context, duplicate: false };
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
    const result = await processWebhookEvent(event);
    const context = result.context;

    // Enviar notificaciones si es necesario (fuera de transacción)
    if (
      !result.duplicate &&
      (event.type === "invoice.paid" ||
        event.type === "invoice.payment_failed" ||
        event.type === "invoice.payment_action_required") &&
      context.academyId &&
      context.tenantId
    ) {
      const invoice = result.invoice ?? (event.data.object as Stripe.Invoice);
      // Un fallo/acción antigua entregada después de un pago no debe producir
      // una alerta falsa. `result.invoice` es el snapshot canónico recuperado
      // durante el procesamiento.
      if (event.type === "invoice.paid" || invoice.status !== "paid") {
        await sendInvoiceNotifications(event.type, invoice, context);
      }
    }

    return NextResponse.json({ received: true, duplicate: result.duplicate });
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
