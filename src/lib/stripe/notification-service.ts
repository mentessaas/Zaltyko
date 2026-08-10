import Stripe from "stripe";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  emailLogs,
  memberships,
  profiles,
  authUsers,
  auditLogs,
  guardianAthletes,
  guardians,
} from "@/db/schema";
import { sendEmail } from "@/lib/brevo";
import { config } from "@/config";
import { logger } from "@/lib/logger";
import { normalizeEmail } from "@/lib/validation/email-utils";
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
  return uniqueEmails.length > 0 ? uniqueEmails : [config.brevo.supportEmail];
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
        replyTo: config.brevo.supportEmail,
      });
    } catch (error) {
      logger.error("Error sending billing notification", error, {
        email,
        academyId,
      });
    }
  }
}

export interface ChargePaymentFailedNotification {
  chargeId: string;
  tenantId: string;
  academyId: string;
  athleteId: string;
  amountCents: number;
  currency: string;
  paymentIntentId: string;
  /**
   * Identificador del evento Stripe que origino la notificacion. Es la pieza
   * que cierra la idempotencia de la entrega junto al destinatario
   * normalizado: si el webhook se reintenta por fallo aguas arriba, el
   * INSERT con `email_logs.idempotency_key` UNIQUE impide reenviar a quien
   * ya recibio el aviso.
   *
   * Si llega null (camino legacy o pruebas), la entrega sigue siendo
   * idempotente por chargeId+recipient pero no se distingue entre retries
   * del mismo webhook y eventos nuevos que comparten cargo.
   */
  stripeEventId: string | null;
  failureReason: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character
  );
}

/**
 * Lease (ms) tras el cual un `email_logs` con status='pending' se considera
 * abandonado y se permite reclamarlo via CAS. Igual o mayor que el backoff
 * minimo de reintento de webhooks Stripe, para que retries reales no
 * colisionen con un envio en curso de un peer.
 */
const EMAIL_LOG_PENDING_LEASE_MS = 60 * 1000;

interface DeliveryOutcome {
  delivered: boolean;
  attempted: boolean;
}

interface DeliveryPayload {
  subject: string;
  html: string;
  text: string;
  replyTo: string;
}

/**
 * Construye la clave UNIQUE de idempotencia: une el evento Stripe (que ya
 * tiene la deduplicacion de billing_events) con el cargo y el destinatario
 * normalizado. Asi, un retry del mismo webhook para el mismo cargo y tutor
 * cae en la UNIQUE y no reenvia; un evento nuevo (por ejemplo un segundo
 * intento del banco) genera una clave nueva y notifica de nuevo.
 */
function buildIdempotencyKey(
  stripeEventId: string | null,
  chargeId: string,
  normalizedRecipient: string
): string {
  const eventPart = stripeEventId ?? "no-event";
  return `charge_failed:${eventPart}:${chargeId}:${normalizedRecipient}`;
}

async function deliverChargeFailureToGuardian(
  notification: ChargePaymentFailedNotification,
  payload: DeliveryPayload,
  normalizedRecipient: string
): Promise<DeliveryOutcome> {
  const now = new Date();
  const idempotencyKey = buildIdempotencyKey(
    notification.stripeEventId,
    notification.chargeId,
    normalizedRecipient
  );

  // Fase 1: reclamar la fila. INSERT ... ON CONFLICT DO NOTHING con la
  // UNIQUE en idempotency_key serializa a los workers: el primero inserta,
  // los demas ven onConflict y deben evaluar la fila existente.
  const inserted = await db
    .insert(emailLogs)
    .values({
      tenantId: notification.tenantId,
      academyId: notification.academyId,
      toEmail: normalizedRecipient,
      subject: payload.subject,
      template: "charge_payment_failed",
      status: "pending",
      idempotencyKey,
      metadata: {
        stripeEventId: notification.stripeEventId,
        chargeId: notification.chargeId,
        paymentIntentId: notification.paymentIntentId,
      },
    })
    .onConflictDoNothing({ target: emailLogs.idempotencyKey })
    .returning({ id: emailLogs.id, status: emailLogs.status, createdAt: emailLogs.createdAt });

  if (inserted.length > 0) {
    return await sendAndFinalize(idempotencyKey);
  }

  // Fase 2: la fila ya existe. Decidir si la reclamamos o la dejamos al peer.
  const [existing] = await db
    .select({
      id: emailLogs.id,
      status: emailLogs.status,
      createdAt: emailLogs.createdAt,
    })
    .from(emailLogs)
    .where(eq(emailLogs.idempotencyKey, idempotencyKey))
    .limit(1);

  if (!existing) {
    // Caso degenerado: onConflict en el INSERT pero la fila no existe
    // (otra transaccion la borro entre el INSERT y el SELECT). Tratamos
    // como no entregado para que el caller propague el error y Stripe
    // reintente limpio.
    return { delivered: false, attempted: false };
  }

  if (existing.status === "sent") {
    // Ya entregado: idempotencia cumplida.
    return { delivered: true, attempted: false };
  }

  // Permitimos reclamar 'error' (es el motivo del retry) y 'pending' solo
  // si el lease expiro (un peer supuestamente lo esta procesando, no
  // queremos duplicar el envio).
  const leaseCutoff = new Date(now.getTime() - EMAIL_LOG_PENDING_LEASE_MS);
  const canClaimFromError = existing.status === "error";
  const canClaimFromStalePending =
    existing.status === "pending" &&
    existing.createdAt !== null &&
    existing.createdAt < leaseCutoff;

  if (!canClaimFromError && !canClaimFromStalePending) {
    // 'sending' o 'pending' reciente: otro worker tiene el lock.
    return { delivered: false, attempted: false };
  }

  // Fase 3: CAS para reclamar atomicamente. Fijamos status en el valor
  // observado: si el peer avanzo a 'sending' o 'sent' entre el SELECT y el
  // UPDATE, RETURNING devuelve 0 filas y nos retiramos sin enviar.
  const claimed = await db
    .update(emailLogs)
    .set({ status: "sending", errorMessage: null })
    .where(
      and(
        eq(emailLogs.idempotencyKey, idempotencyKey),
        eq(emailLogs.status, existing.status)
      )
    )
    .returning({ id: emailLogs.id });

  if (claimed.length === 0) {
    return { delivered: false, attempted: false };
  }

  return await sendAndFinalize(idempotencyKey);

  async function sendAndFinalize(key: string): Promise<DeliveryOutcome> {
    try {
      await sendEmail({
        to: normalizedRecipient,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo,
      });
      await db
        .update(emailLogs)
        .set({ status: "sent", sentAt: now, errorMessage: null })
        .where(eq(emailLogs.idempotencyKey, key));
      return { delivered: true, attempted: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      await db
        .update(emailLogs)
        .set({ status: "error", errorMessage: message })
        .where(eq(emailLogs.idempotencyKey, key));
      // Propagamos para que el webhook handler marque el billing_event como
      // 'error' y Stripe reintente. La fila queda en 'error' para que el
      // proximo intento entre por la rama CAS de la Fase 3.
      throw error;
    }
  }
}

/**
 * Notifica a los tutores del atleta cuando falla un cargo Connect.
 *
 * Idempotencia: cada par (stripeEventId, chargeId, destinatario_normalizado)
 * tiene su propia fila en `email_logs` con clave UNIQUE en
 * `idempotency_key`. El INSERT ... ON CONFLICT DO NOTHING garantiza que dos
 * invocaciones concurrentes no dupliquen el envio; un retry tras un fallo
 * aguas arriba solo reintenta los destinatarios cuya fila quedo en 'error'
 * (o 'pending' stale por lease).
 *
 * Si ningun envio queda registrado para el evento, devuelve `delivered=false`
 * para que el webhook NO marque el billing_event como `processed` y Stripe
 * lo reintente.
 */
export async function sendChargePaymentFailedNotification(
  notification: ChargePaymentFailedNotification
): Promise<boolean> {
  const recipients = await db
    .select({ email: guardians.email })
    .from(guardianAthletes)
    .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .where(
      and(
        eq(guardianAthletes.tenantId, notification.tenantId),
        eq(guardianAthletes.athleteId, notification.athleteId),
        eq(guardians.tenantId, notification.tenantId),
        eq(guardians.notifyEmail, true)
      )
    );

  const normalizedEmails = Array.from(
    new Set(
      recipients
        .map((recipient) => normalizeEmail(recipient.email ?? ""))
        .filter((email): email is string => Boolean(email))
    )
  );
  if (normalizedEmails.length === 0) return false;

  const amount = `${(notification.amountCents / 100).toFixed(2)} ${notification.currency.toUpperCase()}`;
  const subject = "Zaltyko · Cobro rechazado";
  const text = `No se pudo completar el cargo ${notification.chargeId} por ${amount}. Motivo: ${notification.failureReason}. Referencia: ${notification.paymentIntentId}.`;
  const html = `<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Zaltyko · Cobro rechazado</h2><p>Hola,</p><p>No se pudo completar el cargo <strong>${escapeHtml(notification.chargeId)}</strong> por <strong>${escapeHtml(amount)}</strong>.</p><p>Motivo: <strong>${escapeHtml(notification.failureReason)}</strong>.</p><p>Referencia de pago: <strong>${escapeHtml(notification.paymentIntentId)}</strong>.</p></div>`;
  const payload: DeliveryPayload = {
    subject,
    html,
    text,
    replyTo: config.brevo.supportEmail,
  };

  let delivered = 0;
  let attempted = 0;
  // Acumulamos los fallos y propagamos el primero al final: asi, si
  // Brevo falla a mitad de la lista, los destinatarios ya enviados quedan
  // en 'sent' y los pendientes se reintentan en el siguiente webhook via
  // el path CAS de error.
  let firstError: unknown = null;
  for (const email of normalizedEmails) {
    try {
      const outcome = await deliverChargeFailureToGuardian(notification, payload, email);
      if (outcome.delivered) delivered += 1;
      if (outcome.attempted) attempted += 1;
    } catch (error) {
      attempted += 1;
      if (!firstError) firstError = error;
    }
  }

  if (firstError) {
    throw firstError;
  }

  return delivered > 0 || attempted > 0;
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
    tenantId: tenantId as any,
    action: action as any,
    module: "billing" as any,
    status: "success" as any,
    meta,
  });
}

/**
 * Envía notificaciones relacionadas con recibos de suscripción.
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
    const text = `Se registró el pago del recibo ${invoice.number ?? invoice.id} por ${amountFormatted}.`;
    const html = `<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Zaltyko · Pago recibido</h2><p>Hola,</p><p>Se registró el pago del recibo <strong>${invoice.number ?? invoice.id}</strong>.</p><p>Importe cobrado: <strong>${amountFormatted}</strong>.</p><p>Puedes revisarlo en Stripe: <a href="${invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? "#"}" style="color: #0D47A1;">ver recibo</a>.</p></div>`;

    await notifyOwners(context.academyId, subject, html, text);
    await logAuditEvent(context.tenantId, "billing.invoice_paid", {
      invoiceId: invoice.id,
      amount,
      currency: invoice.currency,
    });
  } else if (eventType === "invoice.payment_failed" || eventType === "invoice.payment_action_required") {
    const subject = "Zaltyko · Acción requerida en recibo";
    const text = `El recibo ${invoice.number ?? invoice.id} requiere tu revisión.`;
    const html = `<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Zaltyko · Acción requerida</h2><p>Hola,</p><p>No se pudo completar el cobro del recibo <strong>${invoice.number ?? invoice.id}</strong>.</p><p>Revisa el método de pago desde el portal de Stripe.</p></div>`;

    await notifyOwners(context.academyId, subject, html, text);
    await logAuditEvent(context.tenantId, "billing.invoice_issue", {
      invoiceId: invoice.id,
      status: invoice.status,
      amountDue: invoice.amount_due,
    });
  }
}