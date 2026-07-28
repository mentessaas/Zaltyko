import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { sendEmail } from "@/lib/brevo";
import { config } from "@/config";
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

  if (dedupeKey) {
    const [existing] = await db
      .select({ id: emailLogs.id })
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.template, template ?? "transactional"),
          inArray(emailLogs.status, ["pending", "sent"]),
          sql`${emailLogs.metadata} ->> 'dedupeKey' = ${dedupeKey}`
        )
      )
      .limit(1);
    if (existing) return false;
  }

  // Crear log antes de enviar
  let logEntry: { id: string };
  try {
    [logEntry] = await db
      .insert(emailLogs)
      .values({
        tenantId: tenantId || null,
        academyId: academyId || null,
        userId: userId || null,
        toEmail: to,
        subject,
        template: template || null,
        status: "pending",
        metadata: dedupeKey ? { ...(metadata ?? {}), dedupeKey } : metadata || null,
      })
      .returning({ id: emailLogs.id });
  } catch (error) {
    logger.error("[email-service] insert emailLogs falló:", error, { to, template });
    throw error;
  }

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
    // Antes este catch no dejaba rastro en ningún log de servidor —
    // solo en emailLogs.errorMessage, invisible salvo consultando la
    // BD directamente. Un fallo real de envío pasaba totalmente
    // desapercibido en desarrollo.
    logger.error("[email-service] sendEmail falló:", error, { to, template });
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
