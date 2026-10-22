import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { marketplaceDisputes, marketplaceOrders } from "@/db/schema";
import { resolveDispute } from "@/lib/trust/service";
import { getStripeClient } from "@/lib/stripe/client";

/**
 * POST /api/marketplace/disputes/[id]/resolve
 * Body: { resolvedBy: 'buyer' | 'seller' | 'zaltyko',
 *         resolutionType: 'full' | 'partial',
 *         partialAmountCents?: number, notes: string }
 *
 * Resuelve una disputa. Si resolutionType='partial', crea un refund
 * parcial en Stripe con la cantidad especificada.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    resolvedBy,
    resolutionType = "full",
    partialAmountCents,
    notes,
  } = body ?? {};

  if (
    (resolvedBy !== "buyer" &&
      resolvedBy !== "seller" &&
      resolvedBy !== "zaltyko") ||
    typeof notes !== "string" ||
    (resolutionType !== "full" && resolutionType !== "partial")
  ) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (
    resolutionType === "partial" &&
    (typeof partialAmountCents !== "number" || partialAmountCents <= 0)
  ) {
    return NextResponse.json(
      { error: "partial_amount_required" },
      { status: 400 }
    );
  }

  await resolveDispute({
    disputeId: id,
    resolvedBy,
    notes,
  });

  if (resolutionType === "partial" && partialAmountCents) {
    try {
      const [order] = await db
        .select({
          id: marketplaceOrders.id,
          stripePaymentIntentId: marketplaceOrders.stripePaymentIntentId,
        })
        .from(marketplaceDisputes)
        .innerJoin(marketplaceOrders, eq(marketplaceOrders.id, marketplaceDisputes.orderId))
        .where(eq(marketplaceDisputes.id, id))
        .limit(1);

      if (order?.stripePaymentIntentId) {
        const stripe = getStripeClient();
        await stripe.refunds.create({
          payment_intent: order.stripePaymentIntentId,
          amount: partialAmountCents,
          reason: "requested_by_customer",
          metadata: { disputeId: id, orderId: order.id },
        });

        await db.insert(auditLogs).values({
          tenantId: null,
          userId: null,
          userEmail: null,
          action: "marketplace.dispute.refund.partial",
          module: "marketplace_disputes",
          resourceType: "marketplace_dispute",
          resourceId: id,
          resourceName: id.slice(0, 8),
          description: `Partial refund of ${partialAmountCents} cents via Stripe`,
          status: "success",
        });
      }
    } catch (e: unknown) {
      await db.insert(auditLogs).values({
        tenantId: null,
        userId: null,
        userEmail: null,
        action: "marketplace.dispute.refund.failed",
        module: "marketplace_disputes",
        resourceType: "marketplace_dispute",
        resourceId: id,
        resourceName: id.slice(0, 8),
        description: `Refund failed: ${e instanceof Error ? e.message : "unknown"}`,
        status: "failed",
      });
      return NextResponse.json(
        { error: "refund_failed", detail: e instanceof Error ? e.message : "unknown" },
        { status: 502 }
      );
    }
  }

  await db.insert(auditLogs).values({
    tenantId: null,
    userId: user.id,
    userEmail: null,
    action: "marketplace.dispute.resolved",
    module: "marketplace_disputes",
    resourceType: "marketplace_dispute",
    resourceId: id,
    resourceName: id.slice(0, 8),
    description: `Dispute resolved as ${resolvedBy} (${resolutionType})`,
    status: "success",
  });

  return NextResponse.json({ ok: true });
}
