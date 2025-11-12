import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";

import { db } from "@/db";
import { academies, subscriptions, profiles, billingInvoices } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { getStripeClient } from "@/lib/stripe/client";

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
    return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 500 });
  }

  const stripe = getStripeClient();
  const body = bodySchema.parse(await request.json());

  // Validar que la academia existe y pertenece al tenant
  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(and(eq(academies.id, body.academyId), eq(academies.tenantId, context.tenantId!)))
    .limit(1);

  if (!academy) {
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  // Obtener el customer ID de Stripe desde la suscripción del owner
  if (!academy.ownerId) {
    return NextResponse.json({ error: "ACADEMY_HAS_NO_OWNER" }, { status: 400 });
  }

  const [owner] = await db
    .select({
      userId: profiles.userId,
    })
    .from(profiles)
    .where(eq(profiles.id, academy.ownerId))
    .limit(1);

  if (!owner) {
    return NextResponse.json({ error: "OWNER_NOT_FOUND" }, { status: 404 });
  }

  const [subscription] = await db
    .select({
      stripeCustomerId: subscriptions.stripeCustomerId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, owner.userId))
    .limit(1);

  if (!subscription?.stripeCustomerId) {
    return NextResponse.json(
      { error: "NO_STRIPE_CUSTOMER", message: "No hay un cliente de Stripe asociado" },
      { status: 400 }
    );
  }

  try {
    // Obtener todas las facturas del customer desde Stripe
    const invoices = await stripe.invoices.list({
      customer: subscription.stripeCustomerId,
      limit: 100, // Stripe permite hasta 100 por página
    });

    let synced = 0;
    let updated = 0;
    let errors = 0;

    // Sincronizar cada factura
    for (const invoice of invoices.data) {
      try {
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

        // Verificar si es nueva o actualizada
        const [existing] = await db
          .select({ id: billingInvoices.id })
          .from(billingInvoices)
          .where(eq(billingInvoices.stripeInvoiceId, invoice.id))
          .limit(1);

        if (existing) {
          updated++;
        } else {
          synced++;
        }
      } catch (error) {
        console.error(`Error syncing invoice ${invoice.id}`, error);
        errors++;
      }
    }

    return NextResponse.json({
      ok: true,
      synced,
      updated,
      errors,
      total: invoices.data.length,
    });
  } catch (error: any) {
    console.error("Error syncing invoices", error);
    return NextResponse.json(
      { error: "SYNC_FAILED", message: error?.message ?? "Error al sincronizar facturas" },
      { status: 500 }
    );
  }
});
