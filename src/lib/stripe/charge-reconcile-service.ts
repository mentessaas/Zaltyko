import Stripe from "stripe";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
<<<<<<< HEAD
import { charges, refunds } from "@/db/schema";
=======
import { charges } from "@/db/schema";
>>>>>>> origin/main
import { logger } from "@/lib/logger";
import { sendChargePaymentFailedNotification } from "@/lib/stripe/notification-service";

/**
 * Reconciliacion idempotente del ledger a partir de eventos de pago de Stripe
 * (cuentas conectadas). El webhook ya deduplica via billing_events; aqui las
 * actualizaciones son ademas condicionales para tolerar eventos fuera de orden.
 */

interface ChargeLookup {
  id: string;
  tenantId: string;
  academyId: string;
  athleteId: string;
  amountCents: number;
  currency: string;
  status: string;
  stripeAccountId: string | null;
}

async function findChargeForPaymentIntent(pi: Stripe.PaymentIntent): Promise<ChargeLookup | null> {
  const [row] = await db
    .select({
      id: charges.id,
      tenantId: charges.tenantId,
      academyId: charges.academyId,
      athleteId: charges.athleteId,
      amountCents: charges.amountCents,
      currency: charges.currency,
      status: charges.status,
      stripeAccountId: charges.stripeAccountId,
    })
    .from(charges)
    // El PaymentIntent persistido es la autoridad de lookup. La metadata se
    // valida después contra esa misma fila y nunca puede seleccionar otra.
    .where(eq(charges.stripePaymentIntentId, pi.id))
    .limit(1);
  return row ?? null;
}

export class ConnectEventRejectedError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "ConnectEventRejectedError";
  }
}

function assertPaymentIntentContext(
  charge: ChargeLookup,
  pi: Stripe.PaymentIntent,
  eventAccountId: string | null
): void {
  if (!eventAccountId || charge.stripeAccountId !== eventAccountId) {
    throw new ConnectEventRejectedError("CONNECT_ACCOUNT_MISMATCH");
  }
  if (
    pi.metadata?.chargeId !== charge.id ||
    pi.metadata?.academyId !== charge.academyId ||
    pi.metadata?.tenantId !== charge.tenantId
  ) {
    throw new ConnectEventRejectedError("CONNECT_METADATA_MISMATCH");
  }
}

export async function reconcilePaymentIntentSucceeded(
  pi: Stripe.PaymentIntent,
  eventAccountId: string | null
): Promise<void> {
  const charge = await findChargeForPaymentIntent(pi);
  if (!charge) {
    logger.warn("payment_intent.succeeded sin cargo asociado", { paymentIntentId: pi.id });
    return;
  }
  assertPaymentIntentContext(charge, pi, eventAccountId);
  if (
    pi.amount_received !== charge.amountCents ||
    pi.currency.toLowerCase() !== (charge.currency || "eur").toLowerCase()
  ) {
    throw new ConnectEventRejectedError("CONNECT_AMOUNT_MISMATCH");
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

export async function reconcilePaymentIntentFailed(
  pi: Stripe.PaymentIntent,
  eventAccountId: string | null,
  stripeEventId?: string
): Promise<void> {
  const charge = await findChargeForPaymentIntent(pi);
  if (!charge) return;
  assertPaymentIntentContext(charge, pi, eventAccountId);

  // Transicion atomica: el WHERE excluye estados terminales buenos
  // (paid/refunded) y devuelve la fila solo si efectivamente la transicion
  // aplico. Esto cierra el TOCTOU entre el SELECT inicial y el UPDATE:
  // un cargo que pasa a paid/refunded entre ambas llamadas NO sera
  // sobrescrito por un fallo tardio.
  //
  // El estado previo observado puede ser `pending`, `failed` (caso real de
  // ZAL-8: cargo ya en failed por rechazo sincrono del collect) o cualquier
  // estado no terminal; todos permiten la notificacion. La deduplicacion
  // real de la entrega se delega a email_logs.idempotency_key (UNIQUE).
  const now = new Date();
  const updated = await db
    .update(charges)
    .set({
      status: "failed",
      stripePaymentIntentId: pi.id,
      lastAttemptAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(charges.id, charge.id),
        ne(charges.status, "paid"),
        ne(charges.status, "refunded")
      )
    )
    .returning({ id: charges.id });

  if (updated.length === 0) {
    // El cargo ya esta en estado terminal bueno (paid/refunded) en el
    // momento del UPDATE: una transicion concurrente gano. No notificamos
    // porque ya no es un fallo real para el cliente.
    logger.info("payment_intent.payment_failed omitido: cargo en estado terminal bueno", {
      chargeId: charge.id,
      paymentIntentId: pi.id,
      stripeEventId,
    });
    return;
  }

  await sendChargePaymentFailedNotification({
    chargeId: charge.id,
    tenantId: charge.tenantId,
    academyId: charge.academyId,
    athleteId: charge.athleteId,
    amountCents: charge.amountCents,
    currency: charge.currency,
    paymentIntentId: pi.id,
    stripeEventId: stripeEventId ?? null,
    failureReason:
      pi.last_payment_error?.decline_code ??
      pi.last_payment_error?.code ??
      "payment_failed",
  });
}

export async function reconcilePaymentIntentCanceled(
  pi: Stripe.PaymentIntent,
  eventAccountId: string | null
): Promise<void> {
  const charge = await findChargeForPaymentIntent(pi);
  if (!charge) return;
  assertPaymentIntentContext(charge, pi, eventAccountId);
  if (charge.status === "paid" || charge.status === "refunded") return;
  // La cuota sigue debiendose: vuelve a pendiente para reintento/recordatorio.
  await db
    .update(charges)
    .set({ status: "pending", lastAttemptAt: new Date(), updatedAt: new Date() })
    .where(eq(charges.id, charge.id));
}

export async function reconcileChargeRefunded(
  stripeCharge: Stripe.Charge,
  eventAccountId: string | null
): Promise<void> {
  const [row] = await db
<<<<<<< HEAD
    .select({ id: charges.id, status: charges.status, stripeAccountId: charges.stripeAccountId, tenantId: charges.tenantId, academyId: charges.academyId, currency: charges.currency })
=======
    .select({ id: charges.id, status: charges.status, stripeAccountId: charges.stripeAccountId })
>>>>>>> origin/main
    .from(charges)
    .where(eq(charges.stripeChargeId, stripeCharge.id))
    .limit(1);
  if (!row) {
    logger.warn("charge.refunded sin cargo asociado", { stripeChargeId: stripeCharge.id });
    return;
  }
  if (!eventAccountId || row.stripeAccountId !== eventAccountId) {
    throw new ConnectEventRejectedError("CONNECT_ACCOUNT_MISMATCH");
  }
  if (row.status === "refunded") return;

<<<<<<< HEAD
  // Registrar el reembolso en el ledger (parciales incluidos) para que el
  // cálculo de restante de refund-service no diverja de Stripe.
  await db
    .insert(refunds)
    .values({
      tenantId: row.tenantId,
      academyId: row.academyId,
      chargeId: row.id,
      stripeRefundId:
        stripeCharge.refunds?.data?.[0]?.id ?? `re_${stripeCharge.id}_${stripeCharge.amount_refunded}`,
      amountCents: stripeCharge.amount_refunded,
      currency: row.currency ?? "eur",
      status: "succeeded",
      reason: stripeCharge.refunds?.data?.[0]?.reason ?? null,
    })
    .onConflictDoNothing();

  // Solo un reembolso TOTAL marca el cargo como refunded; un parcial deja el
  // cargo cobrado con el importe reembolsado registrable vía refunds.
  const fullyRefunded = stripeCharge.amount_refunded >= stripeCharge.amount;

  await db
    .update(charges)
    .set({ status: fullyRefunded ? "refunded" : "paid", updatedAt: new Date() })
=======
  await db
    .update(charges)
    .set({ status: "refunded", updatedAt: new Date() })
>>>>>>> origin/main
    .where(eq(charges.id, row.id));
}
