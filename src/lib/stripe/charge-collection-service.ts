import Stripe from "stripe";
import { and, eq, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { charges, paymentAttempts } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe/client";
import { getConnectAccount, isConnectReady } from "@/lib/stripe/connect-service";
import { resolvePayerCustomerForAthlete } from "@/lib/stripe/family-customers-service";
import { withTransaction } from "@/lib/db-transactions";
import { logger } from "@/lib/logger";

export type CollectResult =
  | { ok: true; status: "paid"; paymentIntentId: string }
  | { ok: false; status: "requires_action"; paymentIntentId: string }
  | { ok: false; status: "failed"; reason: string; paymentIntentId?: string }
  | { ok: false; status: "skipped"; reason: string };

const COLLECTIBLE_STATUSES = ["pending", "overdue", "failed"] as const;

interface ChargeRow {
  id: string;
  tenantId: string;
  academyId: string;
  athleteId: string;
  amountCents: number;
  currency: string;
  status: string;
  attemptCount: number;
}

/**
 * Cobra un cargo con la tarjeta guardada de la familia (off-session), sobre la
 * cuenta conectada de la academia. Idempotente por (charge, intento) y protegido
 * con advisory lock para evitar doble cobro concurrente. El ledger `charges` es
 * la fuente de verdad; el webhook (FASE 5) reconcilia el estado final.
 */
export async function collectCharge(chargeId: string): Promise<CollectResult> {
  return withTransaction(async (tx) => {
    // Lock por cargo: serializa intentos concurrentes sobre el mismo cargo.
    if ("execute" in tx && typeof tx.execute === "function") {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${chargeId}))`);
    }

    const [charge] = (await tx
      .select({
        id: charges.id,
        tenantId: charges.tenantId,
        academyId: charges.academyId,
        athleteId: charges.athleteId,
        amountCents: charges.amountCents,
        currency: charges.currency,
        status: charges.status,
        attemptCount: charges.attemptCount,
      })
      .from(charges)
      .where(eq(charges.id, chargeId))
      .limit(1)) as ChargeRow[];

    if (!charge) {
      return { ok: false, status: "skipped", reason: "CHARGE_NOT_FOUND" };
    }
    if (!COLLECTIBLE_STATUSES.includes(charge.status as (typeof COLLECTIBLE_STATUSES)[number])) {
      return { ok: false, status: "skipped", reason: `NOT_COLLECTIBLE:${charge.status}` };
    }
    if (charge.amountCents <= 0) {
      return { ok: false, status: "skipped", reason: "NON_POSITIVE_AMOUNT" };
    }

    const account = await getConnectAccount(charge.academyId);
    if (!isConnectReady(account) || !account) {
      return { ok: false, status: "skipped", reason: "CONNECT_NOT_READY" };
    }

    const payer = await resolvePayerCustomerForAthlete(charge.academyId, charge.athleteId);
    if (!payer || !payer.defaultPaymentMethodId) {
      return { ok: false, status: "skipped", reason: "NO_SAVED_CARD" };
    }

    const attemptNumber = charge.attemptCount + 1;
    const stripe = getStripeClient();
    const opts: Stripe.RequestOptions = {
      stripeAccount: account.stripeAccountId,
      // Idempotencia estable por cargo+intento: reintentos de red no duplican.
      idempotencyKey: `charge_collect_${chargeId}_${attemptNumber}`,
    };

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: charge.amountCents,
          currency: (charge.currency || "eur").toLowerCase(),
          customer: payer.stripeCustomerId,
          payment_method: payer.defaultPaymentMethodId,
          off_session: true,
          confirm: true,
          metadata: {
            chargeId: charge.id,
            academyId: charge.academyId,
            tenantId: charge.tenantId,
          },
        },
        opts
      );
    } catch (error) {
      // Stripe lanza en tarjetas rechazadas / que requieren autenticacion.
      const stripeError = error as {
        code?: string;
        message?: string;
        payment_intent?: Stripe.PaymentIntent;
      };
      const pi = stripeError.payment_intent;
      const requiresAction = stripeError.code === "authentication_required";

      await recordAttempt(tx, {
        charge,
        stripeAccountId: account.stripeAccountId,
        paymentIntentId: pi?.id ?? null,
        status: requiresAction ? "requires_action" : "failed",
        errorCode: stripeError.code ?? null,
        errorMessage: stripeError.message ?? null,
      });

      await tx
        .update(charges)
        .set({
          status: "failed",
          paymentMethod: "card",
          stripePaymentIntentId: pi?.id ?? null,
          stripeAccountId: account.stripeAccountId,
          attemptCount: attemptNumber,
          lastAttemptAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(charges.id, charge.id));

      if (requiresAction && pi?.id) {
        return { ok: false, status: "requires_action", paymentIntentId: pi.id };
      }
      return {
        ok: false,
        status: "failed",
        reason: stripeError.code ?? "card_error",
        paymentIntentId: pi?.id,
      };
    }

    const succeeded = paymentIntent.status === "succeeded";
    const latestChargeId =
      typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : null;

    await recordAttempt(tx, {
      charge,
      stripeAccountId: account.stripeAccountId,
      paymentIntentId: paymentIntent.id,
      status: succeeded ? "succeeded" : paymentIntent.status,
      errorCode: null,
      errorMessage: null,
    });

    await tx
      .update(charges)
      .set({
        status: succeeded ? "paid" : "pending",
        paymentMethod: "card",
        paidAt: succeeded ? new Date() : null,
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId: latestChargeId,
        stripeAccountId: account.stripeAccountId,
        attemptCount: attemptNumber,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(charges.id, charge.id));

    if (succeeded) {
      return { ok: true, status: "paid", paymentIntentId: paymentIntent.id };
    }
    if (paymentIntent.status === "requires_action") {
      return { ok: false, status: "requires_action", paymentIntentId: paymentIntent.id };
    }
    return { ok: false, status: "failed", reason: paymentIntent.status, paymentIntentId: paymentIntent.id };
  });
}

async function recordAttempt(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db,
  params: {
    charge: ChargeRow;
    stripeAccountId: string;
    paymentIntentId: string | null;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
  }
): Promise<void> {
  await tx.insert(paymentAttempts).values({
    tenantId: params.charge.tenantId,
    academyId: params.charge.academyId,
    chargeId: params.charge.id,
    stripePaymentIntentId: params.paymentIntentId,
    stripeAccountId: params.stripeAccountId,
    status: params.status,
    amountCents: params.charge.amountCents,
    currency: (params.charge.currency || "eur").toLowerCase(),
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
  });
}

/**
 * Cobra en lote los cargos cobrables de una academia (opcionalmente de un
 * periodo). Se usa desde acciones de dueño y desde el cron de cobros.
 */
export async function collectDueChargesForAcademy(params: {
  academyId: string;
  period?: string;
  // Solo cargos ya vencidos (dueDate <= hoy). Para el cobro automático programado.
  onlyDue?: boolean;
}): Promise<{ attempted: number; paid: number; failed: number; skipped: number }> {
  const conditions = [
    eq(charges.academyId, params.academyId),
    inArray(charges.status, ["pending", "overdue", "failed"]),
  ];
  if (params.period) {
    conditions.push(eq(charges.period, params.period));
  }
  if (params.onlyDue) {
    const today = new Date().toISOString().split("T")[0];
    conditions.push(lte(charges.dueDate, today));
  }

  const due = await db
    .select({ id: charges.id })
    .from(charges)
    .where(and(...conditions));

  const summary = { attempted: 0, paid: 0, failed: 0, skipped: 0 };
  for (const row of due) {
    try {
      const result = await collectCharge(row.id);
      summary.attempted += 1;
      if (result.status === "paid") summary.paid += 1;
      else if (result.status === "failed" || result.status === "requires_action") summary.failed += 1;
      else summary.skipped += 1;
    } catch (error) {
      summary.skipped += 1;
      logger.error("collectCharge fallo inesperado", error, { chargeId: row.id });
    }
  }
  return summary;
}
