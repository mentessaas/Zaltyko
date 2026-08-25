import { and, eq, inArray, sql, or, gte } from "drizzle-orm";

import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { sendEmail } from "@/lib/brevo";
import { config } from "@/config";
import { isAcademyBlockedFromSending } from "@/lib/academy-status";
import { logger } from "@/lib/logger";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  template?: string;
  tenantId?: string;
  academyId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

export async function sendEmailWithLogging(options: SendEmailOptions): Promise<boolean> {
  const { to, subject, html, template, tenantId, academyId, userId, metadata, dedupeKey } = options;

  // Última barrera común para emisores transaccionales que ya aportan
  // academyId. Así un caller nuevo no puede saltarse el contrato de status.
  if (academyId) {
    const eligibility = await isAcademyBlockedFromSending(academyId);
    if (eligibility.blocked) {
      logger.warn("Email omitido: academia no elegible", {
        academyId,
        reason: eligibility.reason,
        template: template ?? "transactional",
      });
      return false;
    }
  }

  if (dedupeKey) {
    // Los logs pending de más de 1h se consideran huérfanos (proceso muerto
    // entre insert y envío) y no bloquean reintentos.
    const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);
    const [existing] = await db
      .select({ id: emailLogs.id })
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.template, template ?? "transactional"),
          inArray(emailLogs.status, ["pending", "sent"]),
          sql`${emailLogs.metadata} ->> 'dedupeKey' = ${dedupeKey}`,
          or(
            inArray(emailLogs.status, ["sent"]),
            gte(emailLogs.createdAt, staleCutoff)
          )
        )
      )
      .limit(1);
    if (existing) return false;
  }

  // Crear log antes de enviar. Con dedupeKey se rellena idempotencyKey para
  // que el índice único de la tabla respalde la dedupe ante carreras.
  const [logEntry] = await db
    .insert(emailLogs)
    .values({
      tenantId: tenantId || null,
      academyId: academyId || null,
      userId: userId || null,
      toEmail: to,
      subject,
      template: template || null,
      status: "pending",
      idempotencyKey: dedupeKey ? `email:${dedupeKey}` : null,
      metadata: dedupeKey ? { ...(metadata ?? {}), dedupeKey } : metadata || null,
    })
    .onConflictDoNothing()
    .returning({ id: emailLogs.id });

  // Carrera: otra petición insertó el mismo dedupeKey → este envío cede.
  if (!logEntry) return false;

  try {
    await sendEmail({
      to,
      subject,
      html,
      replyTo: process.env.BREVO_REPLY_TO ?? config.brevo.supportEmail,
    });

    // Actualizar log como enviado
    await db
      .update(emailLogs)
      .set({
        status: "sent",
        sentAt: new Date(),
      })
      .where(eq(emailLogs.id, logEntry.id));
    return true;
  } catch (error: unknown) {
    // Actualizar log con error
    await db
      .update(emailLogs)
      .set({
        status: "failed",
        errorMessage:
          error instanceof Error && error.message.startsWith("BREVO_API_ERROR:")
            ? error.message
            : "EMAIL_DELIVERY_FAILED",
      })
      .where(eq(emailLogs.id, logEntry.id));

    throw error;
  }
}
