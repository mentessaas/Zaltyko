import { eq } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";

import { db } from "@/db";
import { subscriptions, billingInvoices } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { getStripeClient } from "@/lib/stripe/client";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { getBillingAcademyAccess } from "@/lib/billing/access";

const bodySchema = z.object({
  academyId: z.string().uuid(),
});

function unixToDate(value?: number | null): Date | null {
  if (!value) {
    return null;
  }
  return new Date(value * 1000);
}

function metadataToRecord(metadata: Stripe.Metadata | undefined | null) {
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

export const POST = withTenant(async (request, context) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return apiError("STRIPE_NOT_CONFIGURED", "Stripe is not configured", 500);
  }

  const stripe = getStripeClient();
  const body = bodySchema.parse(await request.json());

  const academy = await getBillingAcademyAccess({
    academyId: body.academyId,
    userId: context.userId,
    profileId: context.profile.id,
    profileRole: context.profile.role,
  });
  if (!academy) {
    return apiError("BILLING_FORBIDDEN", "Solo la persona propietaria puede sincronizar la suscripción", 403);
  }

  const [subscription] = await db
    .select({
      stripeCustomerId: subscriptions.stripeCustomerId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, academy.ownerUserId))
    .limit(1);

  if (!subscription?.stripeCustomerId) {
    return apiError("NO_STRIPE_CUSTOMER", "No Stripe customer associated", 400);
  }

  try {
    // Obtener todos los recibos del customer desde Stripe.
    const invoices = await stripe.invoices.list({
      customer: subscription.stripeCustomerId,
      limit: 100, // Stripe permite hasta 100 por página
    });

    let synced = 0;
    let updated = 0;
    let errors = 0;

    // Sincronizar cada recibo.
    for (const invoice of invoices.data) {
      try {
        const invoiceCustomerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (invoiceCustomerId !== subscription.stripeCustomerId) {
          logger.error("Skipping Stripe invoice with mismatched customer", undefined, {
            invoiceId: invoice.id,
            academyId: academy.id,
          });
          errors++;
          continue;
        }

        const [existing] = await db
          .select({ id: billingInvoices.id })
          .from(billingInvoices)
          .where(eq(billingInvoices.stripeInvoiceId, invoice.id))
          .limit(1);

        await db
          .insert(billingInvoices)
          .values({
            academyId: academy.id,
            tenantId: academy.tenantId ?? undefined,
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
              academyId: academy.id,
              tenantId: academy.tenantId ?? undefined,
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

        if (existing) {
          updated++;
        } else {
          synced++;
        }
      } catch (error) {
        logger.error(`Error syncing invoice ${invoice.id}`, error);
        errors++;
      }
    }

    return apiSuccess({ synced, updated, errors, total: invoices.data.length });
  } catch (error: unknown) {
    logger.error("Error syncing invoices", error);
    return apiError("SYNC_FAILED", "Error al sincronizar recibos", 500);
  }
});
