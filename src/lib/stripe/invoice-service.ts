import Stripe from "stripe";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { billingInvoices, billingEvents } from "@/db/schema";
import { withTransaction } from "@/lib/db-transactions";
import { getAcademyContextFromInvoice } from "@/lib/stripe/context-resolver";
import { updateBillingEventStatus } from "@/lib/stripe/billing-events-service";
import { getStripeClient } from "@/lib/stripe/client";
import type { WebhookContext } from "@/lib/stripe/webhook-handler";

/**
 * Convierte un timestamp de Unix a Date
 */
function unixToDate(value?: number | null): Date | null {
  if (!value) {
    return null;
  }
  return new Date(value * 1000);
}

/**
 * Convierte metadata de Stripe a un objeto Record
 */
function metadataToRecord(metadata: Stripe.Metadata | undefined | null): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }

  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined && value !== null
  ) as Array<[string, string]>;

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

/**
 * Inserta o actualiza un registro de factura en la base de datos
 */
export async function upsertInvoiceRecord(
  invoice: Stripe.Invoice,
  academyId: string | null,
  tenantId: string | null
): Promise<void> {
  if (!academyId) {
    return;
  }

  await db
    .insert(billingInvoices)
    .values({
      academyId,
      tenantId: tenantId ?? undefined,
      stripeInvoiceId: invoice.id,
      status: invoice.status ?? "open",
      amountDue: invoice.amount_due ?? undefined,
      amountPaid: invoice.amount_paid ?? undefined,
      currency: invoice.currency ?? undefined,
      billingReason: invoice.billing_reason ?? undefined,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? undefined,
      invoicePdf: invoice.invoice_pdf ?? undefined,
      periodStart: unixToDate(invoice.period_start),
      periodEnd: unixToDate(invoice.period_end),
      metadata: metadataToRecord(invoice.metadata),
    })
    .onConflictDoUpdate({
      target: billingInvoices.stripeInvoiceId,
      set: {
        tenantId: tenantId ?? undefined,
        status: invoice.status ?? "open",
        amountDue: invoice.amount_due ?? undefined,
        amountPaid: invoice.amount_paid ?? undefined,
        currency: invoice.currency ?? undefined,
        billingReason: invoice.billing_reason ?? undefined,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? undefined,
        invoicePdf: invoice.invoice_pdf ?? undefined,
        periodStart: unixToDate(invoice.period_start),
        periodEnd: unixToDate(invoice.period_end),
        metadata: metadataToRecord(invoice.metadata),
      },
    });
}

/**
 * Maneja eventos relacionados con facturas
 */
export async function handleInvoiceEvent(
  eventType: "invoice.paid" | "invoice.payment_failed" | "invoice.payment_action_required" | "invoice.finalized" | "invoice.updated",
  invoice: Stripe.Invoice,
  eventId: string
): Promise<WebhookContext> {
  const stripe = getStripeClient();

  return await withTransaction(async (tx) => {
    const context = await getAcademyContextFromInvoice(invoice, stripe);

    await upsertInvoiceRecord(invoice, context.academyId, context.tenantId);

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

    return context;
  });
}

