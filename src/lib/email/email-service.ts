import { eq } from "drizzle-orm";

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
  idempotencyKey?: string;
}

export async function sendEmailWithLogging(
  options: SendEmailOptions
): Promise<"sent" | "duplicate"> {
  const { to, subject, html, template, tenantId, academyId, userId, metadata, idempotencyKey } = options;

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
      metadata: metadata || null,
      idempotencyKey: idempotencyKey || null,
    })
    .onConflictDoNothing({ target: emailLogs.idempotencyKey })
    .returning({ id: emailLogs.id });

  if (!logEntry) return "duplicate";

  try {
    await sendEmail({
      to,
      subject,
      html,
      replyTo: config.brevo.fromAdmin,
    });

    // Actualizar log como enviado
    await db
      .update(emailLogs)
      .set({
        status: "sent",
        sentAt: new Date(),
      })
      .where(eq(emailLogs.id, logEntry.id));

    return "sent";
  } catch (error: unknown) {
    // Actualizar log con error
    await db
      .update(emailLogs)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Error desconocido",
        idempotencyKey: null,
      })
      .where(eq(emailLogs.id, logEntry.id));

    throw error;
  }
}

