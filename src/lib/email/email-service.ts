import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { sendEmail } from "@/lib/brevo";
import { config } from "@/config";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  template?: string;
  tenantId?: string;
  academyId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  /**
   * Clave legacy de deduplicacion. Tambien se escribe en
   * `email_logs.metadata->>'dedupeKey'` para mantener compatibilidad con el
   * chequeo de dedupe actual.
   */
  dedupeKey?: string;
  /**
   * Idempotency key canonica (ZAL-314 B1). Se persiste en la columna
   * `email_logs.idempotency_key` (unique index). Tambien se usa como base
   * para el chequeo de dedupe cuando `dedupeKey` no se pasa.
   */
  idempotencyKey?: string;
}

export async function sendEmailWithLogging(options: SendEmailOptions): Promise<boolean> {
  const {
    to,
    subject,
    html,
    template,
    tenantId,
    academyId,
    userId,
    metadata,
    dedupeKey,
    idempotencyKey,
  } = options;

  const effectiveDedupeKey = dedupeKey ?? idempotencyKey;

  if (effectiveDedupeKey) {
    const [existing] = await db
      .select({ id: emailLogs.id })
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.template, template ?? "transactional"),
          inArray(emailLogs.status, ["pending", "sent"]),
          sql`${emailLogs.metadata} ->> 'dedupeKey' = ${effectiveDedupeKey}`
        )
      )
      .limit(1);
    if (existing) return false;
  }

  // Crear log antes de enviar
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
      idempotencyKey: idempotencyKey ?? null,
      metadata: effectiveDedupeKey
        ? { ...(metadata ?? {}), dedupeKey: effectiveDedupeKey }
        : metadata || null,
    })
    .returning({ id: emailLogs.id });

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
