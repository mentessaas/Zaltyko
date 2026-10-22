import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@/db";
import { getStripeClient } from "@/lib/stripe/client";
import { auditLogs, billingEvents, marketplaceOrders, marketplaceListings, profiles, academies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { markOrderPaid } from "@/lib/marketplace/service";

/**
 * POST /api/marketplace/webhook
 * Webhook específico para eventos de marketplace con dedupe por stripe_event_id.
 *
 * Manejados:
 *   - checkout.session.completed con metadata.orderId → markOrderPaid + email seller
 *
 * El dedupe usa `billing_events.stripeEventId` (UNIQUE) — patrón ya existente
 * en el repo. Re-entregas de Stripe (mismo event.id) no duplican efectos.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret =
    process.env.STRIPE_MARKETPLACE_WEBHOOK_SECRET ??
    process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "webhook_secret_not_configured" },
      { status: 500 }
    );
  }

  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig ?? "", secret);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "signature_invalid", detail: e instanceof Error ? e.message : "unknown" },
      { status: 400 }
    );
  }

  // Dedupe via billing_events
  try {
    await db.insert(billingEvents).values({
      stripeEventId: event.id,
      type: event.type,
      status: "received",
      attemptCount: 1,
      stripeCreatedAt: new Date(event.created * 1000),
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
    });
  } catch {
    // UNIQUE violation → evento ya procesado
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    const listingId = session.metadata?.listingId;
    if (orderId) {
      try {
        await markOrderPaid(orderId, session.payment_intent as string);
        await db.insert(auditLogs).values({
          tenantId: null,
          userId: null,
          userEmail: null,
          action: "marketplace.order.paid",
          module: "marketplace_orders",
          resourceType: "marketplace_order",
          resourceId: orderId,
          resourceName: orderId.slice(0, 8),
          description: `Marketplace order paid via Stripe checkout ${session.id}`,
          status: "success",
        });

        // Notificar seller (best-effort)
        //
        // TODO(marketplace-trust-pack): restaurar notifySellerOfMarketplaceOrder
        // cuando `getOrder()` y `notifySellerOfMarketplaceOrder()` migren al schema real
        // (eliminan dependencia de profiles.email y academies.ownerId que aún no existen).
        // Por ahora solo auditamos el evento paid; la notificación la reenviaremos
        // por el panel de seller en lugar de email.
        try {
          await db.insert(auditLogs).values({
            tenantId: null,
            userId: null,
            userEmail: null,
            action: "marketplace.notification.skipped",
            module: "marketplace_orders",
            resourceType: "marketplace_order",
            resourceId: orderId,
            resourceName: orderId.slice(0, 8),
            description: `Notification deferred: seller email pipeline pending schema migration (2026-09-24 E2E audit).`,
            status: "pending",
          });
        } catch {
          // No-op: notification best-effort, fallo no debe afectar paid.
        }
      } catch (e: unknown) {
        await db.insert(auditLogs).values({
          tenantId: null,
          userId: null,
          userEmail: null,
          action: "marketplace.order.paid",
          module: "marketplace_orders",
          resourceType: "marketplace_order",
          resourceId: orderId,
          resourceName: orderId.slice(0, 8),
          description: `Failed to mark paid: ${e instanceof Error ? e.message : "unknown"}`,
          status: "failed",
        });
      }
    }
  }

  await db
    .update(billingEvents)
    .set({ status: "success", processedAt: new Date() })
    .where(eq(billingEvents.stripeEventId, event.id));

  return NextResponse.json({ received: true });
}
