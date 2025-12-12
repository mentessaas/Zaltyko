import Stripe from "stripe";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { memberships, profiles, authUsers, auditLogs } from "@/db/schema";
import { sendEmail } from "@/lib/mailgun";
import { config } from "@/config";
import { logger } from "@/lib/logger";
import type { WebhookContext } from "@/lib/stripe/webhook-handler";

/**
 * Obtiene los emails de los owners de una academia
 */
async function getOwnerEmails(academyId: string): Promise<string[]> {
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
  return uniqueEmails.length > 0 ? uniqueEmails : [config.mailgun.supportEmail];
}

/**
 * Envía notificaciones por email a los owners
 */
async function notifyOwners(
  academyId: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const emails = await getOwnerEmails(academyId);

  for (const email of emails) {
    try {
      await sendEmail({
        to: email,
        subject,
        html,
        text,
        replyTo: config.mailgun.supportEmail,
      });
    } catch (error) {
      logger.error("Error sending billing notification", error, {
        email,
        academyId,
      });
    }
  }
}

/**
 * Registra un evento en el log de auditoría
 */
async function logAuditEvent(
  tenantId: string | null,
  action: string,
  meta: Record<string, unknown>
): Promise<void> {
  await db.insert(auditLogs).values({
    tenantId: tenantId ?? undefined,
    action,
    meta,
  });
}

/**
 * Envía notificaciones relacionadas con facturas
 */
export async function sendInvoiceNotification(
  eventType: "invoice.paid" | "invoice.payment_failed" | "invoice.payment_action_required",
  invoice: Stripe.Invoice,
  context: WebhookContext
): Promise<void> {
  if (!context.academyId || !context.tenantId) {
    return;
  }

  const amount = invoice.amount_paid ?? invoice.amount_due ?? 0;
  const amountFormatted = `${(amount / 100).toFixed(2)} ${(invoice.currency ?? "eur").toUpperCase()}`;

  if (eventType === "invoice.paid") {
    const subject = "Zaltyko · Pago recibido";
    const text = `Se registró el pago de la factura ${invoice.number ?? invoice.id} por ${amountFormatted}.`;
    const html = `<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Zaltyko · Pago recibido</h2><p>Hola,</p><p>Se registró el pago de la factura <strong>${invoice.number ?? invoice.id}</strong>.</p><p>Importe cobrado: <strong>${amountFormatted}</strong>.</p><p>Puedes revisarla en Stripe: <a href="${invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? "#"}" style="color: #0D47A1;">ver factura</a>.</p></div>`;
    
    await notifyOwners(context.academyId, subject, html, text);
    await logAuditEvent(context.tenantId, "billing.invoice_paid", {
      invoiceId: invoice.id,
      amount,
      currency: invoice.currency,
    });
  } else if (eventType === "invoice.payment_failed" || eventType === "invoice.payment_action_required") {
    const subject = "Zaltyko · Acción requerida en factura";
    const text = `La factura ${invoice.number ?? invoice.id} requiere tu revisión.`;
    const html = `<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Zaltyko · Acción requerida</h2><p>Hola,</p><p>No se pudo completar el cobro de la factura <strong>${invoice.number ?? invoice.id}</strong>.</p><p>Revisa el método de pago desde el portal de Stripe.</p></div>`;
    
    await notifyOwners(context.academyId, subject, html, text);
    await logAuditEvent(context.tenantId, "billing.invoice_issue", {
      invoiceId: invoice.id,
      status: invoice.status,
      amountDue: invoice.amount_due,
    });
  }
}

