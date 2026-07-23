import { and, eq, sql } from "drizzle-orm";

import { charges, refunds } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe/client";
import { createAuditLog } from "@/lib/audit-log";
import { withTransaction } from "@/lib/db-transactions";

export type RefundResult =
  | { ok: true; refundId: string }
  | { ok: false; reason: string };

interface RefundParams {
  chargeId: string;
  amountCents?: number; // Parcial opcional; por defecto reembolso total.
  reason?: string;
  actorUserId: string;
}

/**
 * Reembolsa un cargo cobrado con tarjeta. El reembolso se ejecuta en la cuenta
 * conectada de la academia (merchant of record). Registra el reembolso, marca el
 * cargo como refunded y deja auditoria. El webhook charge.refunded reconcilia.
 */
export async function refundCharge(params: RefundParams): Promise<RefundResult> {
  return withTransaction(async (tx) => {
    if ("execute" in tx && typeof tx.execute === "function") {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.chargeId}))`);
    }

    const [charge] = await tx
      .select({
        id: charges.id,
        tenantId: charges.tenantId,
        academyId: charges.academyId,
        amountCents: charges.amountCents,
        currency: charges.currency,
        status: charges.status,
        stripePaymentIntentId: charges.stripePaymentIntentId,
        stripeAccountId: charges.stripeAccountId,
      })
      .from(charges)
      .where(eq(charges.id, params.chargeId))
      .limit(1);

    if (!charge) return { ok: false, reason: "CHARGE_NOT_FOUND" };
    if (charge.status !== "paid") {
      return { ok: false, reason: `NOT_REFUNDABLE:${charge.status}` };
    }
    if (!charge.stripePaymentIntentId || !charge.stripeAccountId) {
      return { ok: false, reason: "NOT_A_CARD_PAYMENT" };
    }

    const [totals] = await tx
      .select({
        refundedCents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int`,
      })
      .from(refunds)
      .where(and(eq(refunds.chargeId, charge.id), sql`${refunds.status} <> 'failed'`));
    const alreadyRefunded = totals?.refundedCents ?? 0;
    const remaining = charge.amountCents - alreadyRefunded;
    const amount = params.amountCents ?? remaining;
    if (amount <= 0 || amount > remaining) {
      return { ok: false, reason: "INVALID_AMOUNT" };
    }

    const stripe = getStripeClient();
    const refund = await stripe.refunds.create(
      {
        payment_intent: charge.stripePaymentIntentId,
        amount,
        metadata: { chargeId: charge.id, academyId: charge.academyId, tenantId: charge.tenantId },
      },
      {
        stripeAccount: charge.stripeAccountId,
        idempotencyKey: `refund_${charge.id}_${alreadyRefunded}_${amount}`,
      }
    );

    const [existingRefund] = await tx
      .select({ id: refunds.id })
      .from(refunds)
      .where(eq(refunds.stripeRefundId, refund.id))
      .limit(1);

    if (!existingRefund) {
      await tx.insert(refunds).values({
        tenantId: charge.tenantId,
        academyId: charge.academyId,
        chargeId: charge.id,
        stripeRefundId: refund.id,
        stripePaymentIntentId: charge.stripePaymentIntentId,
        amountCents: amount,
        currency: (charge.currency || "eur").toLowerCase(),
        reason: params.reason ?? null,
        status: refund.status ?? "pending",
        createdBy: null,
      });
    }

    if (alreadyRefunded + amount >= charge.amountCents) {
      await tx
        .update(charges)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(charges.id, charge.id));
    }

    await createAuditLog({
      tenantId: charge.tenantId,
      userId: params.actorUserId,
      action: "billing.update",
      resourceType: "charge",
      resourceId: charge.id,
      metadata: { action: "refund", amountCents: amount, stripeRefundId: refund.id },
    });

    return { ok: true, refundId: refund.id };
  });
}
