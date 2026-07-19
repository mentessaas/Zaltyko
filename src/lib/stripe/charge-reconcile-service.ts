import Stripe from "stripe";
import { eq, or } from "drizzle-orm";

import { db } from "@/db";
import { charges } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * Reconciliacion idempotente del ledger a partir de eventos de pago de Stripe
 * (cuentas conectadas). El webhook ya deduplica via billing_events; aqui las
 * actualizaciones son ademas condicionales para tolerar eventos fuera de orden.
 */

interface ChargeLookup {
  id: string;
  status: string;
}

async function findChargeForPaymentIntent(pi: Stripe.PaymentIntent): Promise<ChargeLookup | null> {
  const metaChargeId = pi.metadata?.chargeId;
  const [row] = await db
    .select({ id: charges.id, status: charges.status })
    .from(charges)
    .where(
      metaChargeId
        ? or(eq(charges.id, metaChargeId), eq(charges.stripePaymentIntentId, pi.id))
        : eq(charges.stripePaymentIntentId, pi.id)
    )
    .limit(1);
  return row ?? null;
}

export async function reconcilePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const charge = await findChargeForPaymentIntent(pi);
  if (!charge) {
    logger.warn("payment_intent.succeeded sin cargo asociado", { paymentIntentId: pi.id });
    return;
  }
  // No pisar un cargo ya reembolsado.
  if (charge.status === "refunded") return;

  const latestChargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : null;
  await db
    .update(charges)
    .set({
      status: "paid",
      paymentMethod: "card",
      paidAt: new Date(),
      stripePaymentIntentId: pi.id,
      stripeChargeId: latestChargeId,
      updatedAt: new Date(),
    })
    .where(eq(charges.id, charge.id));
}

export async function reconcilePaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const charge = await findChargeForPaymentIntent(pi);
  if (!charge) return;
  // Un fallo tardio no debe revertir un cargo ya pagado o reembolsado.
  if (charge.status === "paid" || charge.status === "refunded") return;

  await db
    .update(charges)
    .set({
      status: "failed",
      stripePaymentIntentId: pi.id,
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(charges.id, charge.id));
}

export async function reconcilePaymentIntentCanceled(pi: Stripe.PaymentIntent): Promise<void> {
  const charge = await findChargeForPaymentIntent(pi);
  if (!charge) return;
  if (charge.status === "paid" || charge.status === "refunded") return;
  // La cuota sigue debiendose: vuelve a pendiente para reintento/recordatorio.
  await db
    .update(charges)
    .set({ status: "pending", lastAttemptAt: new Date(), updatedAt: new Date() })
    .where(eq(charges.id, charge.id));
}

export async function reconcileChargeRefunded(stripeCharge: Stripe.Charge): Promise<void> {
  const [row] = await db
    .select({ id: charges.id, status: charges.status })
    .from(charges)
    .where(eq(charges.stripeChargeId, stripeCharge.id))
    .limit(1);
  if (!row) {
    logger.warn("charge.refunded sin cargo asociado", { stripeChargeId: stripeCharge.id });
    return;
  }
  if (row.status === "refunded") return;

  await db
    .update(charges)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(eq(charges.id, row.id));
}
