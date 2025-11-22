import { eq } from "drizzle-orm";

import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { sendEmail } from "@/lib/mailgun";
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
}

export async function sendEmailWithLogging(options: SendEmailOptions): Promise<void> {
  const { to, subject, html, template, tenantId, academyId, userId, metadata } = options;

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
    })
    .returning({ id: emailLogs.id });

  try {
    await sendEmail({
      to,
      subject,
      html,
      replyTo: config.mailgun.fromAdmin,
    });

    // Actualizar log como enviado
    await db
      .update(emailLogs)
      .set({
        status: "sent",
        sentAt: new Date(),
      })
      .where(eq(emailLogs.id, logEntry.id));
  } catch (error: any) {
    // Actualizar log con error
    await db
      .update(emailLogs)
      .set({
        status: "failed",
        errorMessage: error.message || "Error desconocido",
      })
      .where(eq(emailLogs.id, logEntry.id));

    throw error;
  }
}

