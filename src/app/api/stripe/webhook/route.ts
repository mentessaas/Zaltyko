import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { config } from "@/config";
import { db } from "@/db";
import {
  academies,
  auditLogs,
  authUsers,
  billingEvents,
  billingInvoices,
  memberships,
  plans,
  profiles,
  subscriptions,
} from "@/db/schema";
import { sendEmail } from "@/lib/mailgun";
import { getStripeClient } from "@/lib/stripe/client";

function unixToDate(value?: number | null): Date | null {
  if (!value) {
    return null;
  }
  return new Date(value * 1000);
}

function extractMetadataValue(metadata: Stripe.Metadata | undefined | null, key: string) {
  if (!metadata) return undefined;
  return metadata[key] ?? metadata[key as keyof typeof metadata];
}

async function getPlanIdByStripePrice(priceId?: string | null, planCode?: string | null) {
  if (!priceId && !planCode) {
    return null;
  }

  if (priceId) {
    const [planByPrice] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.stripePriceId, priceId))
      .limit(1);
    if (planByPrice) {
      return planByPrice.id;
    }
  }

  if (planCode) {
    const [planByCode] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.code, planCode))
      .limit(1);
    if (planByCode) {
      return planByCode.id;
    }
  }

  return null;
}

async function updateSubscriptionRecord(
  subscription: Stripe.Subscription,
  userId: string
) {
  const price = subscription.items?.data?.[0]?.price;
  const priceId = price?.id ?? null;
  const planCode =
    extractMetadataValue(subscription.metadata, "planCode") ??
    extractMetadataValue(subscription.metadata, "plan_code") ?? null;

  const planId = await getPlanIdByStripePrice(priceId, planCode ?? undefined);

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  const status = subscription.status ?? "incomplete";
  const currentPeriodEnd = unixToDate(subscription.current_period_end);

  await db
    .insert(subscriptions)
    .values({
      userId,
      planId: planId ?? undefined,
      status,
      stripeCustomerId: stripeCustomerId ?? undefined,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId ?? undefined,
      cancelAtPeriodEnd,
      currentPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        planId: planId ?? undefined,
        status,
        stripeCustomerId: stripeCustomerId ?? undefined,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId ?? undefined,
        cancelAtPeriodEnd,
        currentPeriodEnd,
      },
    });

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

async function resolveAcademyContext(
  academyId: string | null | undefined
): Promise<{ academyId: string | null; tenantId: string | null }> {
  if (!academyId) {
    return { academyId: null, tenantId: null };
  }

  const [academy] = await db
    .select({ tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  return {
    academyId,
    tenantId: academy?.tenantId ?? null,
  };
}

async function getAcademyContextFromSubscription(
  subscription: Stripe.Subscription
): Promise<{ academyId: string | null; tenantId: string | null; userId: string | null }> {
  const metadata = subscription.metadata;
  const userId =
    extractMetadataValue(metadata, "userId") ??
    extractMetadataValue(metadata, "user_id") ??
    null;
  
  const academyId =
    extractMetadataValue(metadata, "academyId") ??
    extractMetadataValue(metadata, "academy_id") ??
    null;
  const tenantId =
    extractMetadataValue(metadata, "tenantId") ??
    extractMetadataValue(metadata, "tenant_id") ??
    null;

  if (userId) {
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (profile) {
      const [academy] = await db
        .select({ id: academies.id, tenantId: academies.tenantId })
        .from(academies)
        .where(eq(academies.ownerId, profile.id))
        .limit(1);

      if (academy) {
        return { academyId: academy.id, tenantId: academy.tenantId, userId };
      }
    }
  }

  if (academyId) {
    if (tenantId) {
      return { academyId, tenantId, userId };
    }
    const context = await resolveAcademyContext(academyId);
    return { ...context, userId };
  }

  return { academyId: null, tenantId: null, userId };
}

async function getAcademyContextFromInvoice(
  invoice: Stripe.Invoice,
  stripe: Stripe
): Promise<{ academyId: string | null; tenantId: string | null; userId: string | null }> {
  const metadata = invoice.metadata;
  let userId =
    extractMetadataValue(metadata, "userId") ??
    extractMetadataValue(metadata, "user_id") ??
    null;
  let academyId =
    extractMetadataValue(metadata, "academyId") ??
    extractMetadataValue(metadata, "academy_id") ??
    null;
  let tenantId =
    extractMetadataValue(metadata, "tenantId") ??
    extractMetadataValue(metadata, "tenant_id") ??
    null;

  if (academyId && tenantId) {
    return { academyId, tenantId, userId };
  }

  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id ?? null;

  if (subscriptionId) {
    const [subscriptionRow] = await db
      .select({
        userId: subscriptions.userId,
      })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
      .limit(1);

    if (subscriptionRow?.userId) {
      userId = subscriptionRow.userId;
      const [profile] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.userId, subscriptionRow.userId))
        .limit(1);

      if (profile) {
        const [academy] = await db
          .select({ id: academies.id, tenantId: academies.tenantId })
          .from(academies)
          .where(eq(academies.ownerId, profile.id))
          .limit(1);

        if (academy) {
          academyId = academy.id;
          tenantId = academy.tenantId;
        }
      }
    } else {
      const remoteSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      const meta = remoteSubscription.metadata;
      userId =
        userId ??
        extractMetadataValue(meta, "userId") ??
        extractMetadataValue(meta, "user_id") ??
        null;
      academyId =
        academyId ??
        extractMetadataValue(meta, "academyId") ??
        extractMetadataValue(meta, "academy_id") ??
        null;
      tenantId =
        tenantId ??
        extractMetadataValue(meta, "tenantId") ??
        extractMetadataValue(meta, "tenant_id") ??
        null;

      if (userId && !academyId) {
        const [profile] = await db
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .limit(1);

        if (profile) {
          const [academy] = await db
            .select({ id: academies.id, tenantId: academies.tenantId })
            .from(academies)
            .where(eq(academies.ownerId, profile.id))
            .limit(1);

          if (academy) {
            academyId = academy.id;
            tenantId = academy.tenantId;
          }
        }
      }
    }
  }

  if (academyId && !tenantId) {
    const context = await resolveAcademyContext(academyId);
    tenantId = context.tenantId;
  }

  return { academyId, tenantId, userId };
}

async function notifyOwners(
  academyId: string,
  subject: string,
  html: string,
  text: string
) {
  const recipients = await db
    .select({
      email: authUsers.email,
      name: profiles.name,
    })
    .from(memberships)
    .innerJoin(profiles, eq(memberships.userId, profiles.userId))
    .innerJoin(authUsers, eq(authUsers.id, profiles.userId))
    .where(and(eq(memberships.academyId, academyId), eq(memberships.role, "owner")));

  const emails = recipients
    .map((recipient) => recipient.email)
    .filter((value): value is string => Boolean(value));

  const uniqueEmails = Array.from(new Set(emails));
  const targets = uniqueEmails.length > 0 ? uniqueEmails : [config.mailgun.supportEmail];

  for (const email of targets) {
    try {
      await sendEmail({
        to: email,
        subject,
        html,
        text,
        replyTo: config.mailgun.supportEmail,
      });
    } catch (error) {
      console.error("Error sending billing notification", email, error);
    }
  }
}

async function logAuditEvent(
  tenantId: string | null,
  action: string,
  meta: Record<string, unknown>
) {
  await db.insert(auditLogs).values({
    tenantId: tenantId ?? undefined,
    action,
    meta,
  });
}

async function upsertInvoiceRecord(
  invoice: Stripe.Invoice,
  academyId: string | null,
  tenantId: string | null
) {
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

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature ?? "", webhookSecret);
  } catch (error: any) {
    console.error("Stripe signature verification failed", error?.message ?? error);
    return NextResponse.json({ error: "SIGNATURE_VERIFICATION_FAILED" }, { status: 400 });
  }

  const [eventRow] = await db
    .insert(billingEvents)
    .values({
      stripeEventId: event.id,
      type: event.type,
      status: "processing",
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: billingEvents.stripeEventId,
      set: {
        type: event.type,
        status: "processing",
        errorMessage: null,
        payload: event as unknown as Record<string, unknown>,
        processedAt: null,
      },
    })
    .returning({ id: billingEvents.id });

  const eventId = eventRow.id;

  try {
    let academyId: string | null = null;
    let tenantId: string | null = null;
    let userId: string | null = null;

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const context = await getAcademyContextFromSubscription(subscription);
      academyId = context.academyId;
      tenantId = context.tenantId;
      userId = context.userId;

      if (userId) {
        await updateSubscriptionRecord(subscription, userId);
      }
    } else if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.payment_action_required" ||
      event.type === "invoice.finalized" ||
      event.type === "invoice.updated"
    ) {
      const invoice = event.data.object as Stripe.Invoice;
      const context = await getAcademyContextFromInvoice(invoice, stripe);
      academyId = context.academyId;
      tenantId = context.tenantId;
      userId = context.userId;

      await upsertInvoiceRecord(invoice, academyId, tenantId);

      if (academyId && tenantId) {
        const amount = invoice.amount_paid ?? invoice.amount_due ?? 0;
        const amountFormatted = `${(amount / 100).toFixed(2)} ${(invoice.currency ?? "eur").toUpperCase()}`;

        if (event.type === "invoice.paid") {
          const subject = "Zaltyko · Pago recibido";
          const text = `Se registró el pago de la factura ${invoice.number ?? invoice.id} por ${amountFormatted}.`;
          const html = `<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Zaltyko · Pago recibido</h2><p>Hola,</p><p>Se registró el pago de la factura <strong>${invoice.number ?? invoice.id}</strong>.</p><p>Importe cobrado: <strong>${amountFormatted}</strong>.</p><p>Puedes revisarla en Stripe: <a href="${invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? "#"}" style="color: #0D47A1;">ver factura</a>.</p></div>`;
          await notifyOwners(academyId, subject, html, text);
          await logAuditEvent(tenantId, "billing.invoice_paid", {
            invoiceId: invoice.id,
            amount,
            currency: invoice.currency,
          });
        }

      if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
          const subject = "Zaltyko · Acción requerida en factura";
          const text = `La factura ${invoice.number ?? invoice.id} requiere tu revisión.`;
          const html = `<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Zaltyko · Acción requerida</h2><p>Hola,</p><p>No se pudo completar el cobro de la factura <strong>${invoice.number ?? invoice.id}</strong>.</p><p>Revisa el método de pago desde el portal de Stripe.</p></div>`;
          await notifyOwners(academyId, subject, html, text);
          await logAuditEvent(tenantId, "billing.invoice_issue", {
            invoiceId: invoice.id,
            status: invoice.status,
            amountDue: invoice.amount_due,
          });
        }
      }
    }

    await db
      .update(billingEvents)
      .set({
        status: "processed",
        academyId: academyId ?? undefined,
        tenantId: tenantId ?? undefined,
        processedAt: new Date(),
      })
      .where(eq(billingEvents.id, eventId));

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Stripe webhook processing error", error);

    await db
      .update(billingEvents)
      .set({
        status: "error",
        errorMessage: error?.message ?? "Unknown error",
      })
      .where(eq(billingEvents.id, eventId));

    return NextResponse.json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
}
