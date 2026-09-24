import { and, eq, inArray, sql, or, gte } from "drizzle-orm";

import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { sendEmail } from "@/lib/brevo";
import { config } from "@/config";
import { isAcademyBlockedFromSending } from "@/lib/academy-status";
import { logger } from "@/lib/logger";
import { hasMarketingOptOut } from "@/lib/email/marketing-consent";
import {
  isEmailNotificationEnabled,
  type ClassReminderTiming,
} from "@/lib/notifications/preferences";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  template?: string;
  tenantId?: string;
  academyId?: string;
  userId?: string;
  /** Profile id of the recipient, used for preference enforcement. */
  profileId?: string;
  /** Typed notification key shown in the user's preferences screen. */
  notificationType?: string;
  classReminderTiming?: ClassReminderTiming;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

export async function sendEmailWithLogging(options: SendEmailOptions): Promise<boolean> {
  const {
    to,
    subject,
    html,
    text,
    replyTo,
    template,
    tenantId,
    academyId,
    userId,
    profileId,
    notificationType,
    classReminderTiming,
    metadata,
    dedupeKey,
  } = options;
  const normalizedRecipient = to.trim().toLowerCase();

  // The settings screen controls typed notifications, so enforce that policy
  // in the shared sender. Untyped emails (welcome, access, support, etc.) keep
  // their existing operational semantics and are not silently reclassified.
  if (
    profileId &&
    notificationType &&
    !(await isEmailNotificationEnabled(profileId, notificationType, classReminderTiming))
  ) {
    logger.info("Email omitido: preferencia de notificación deshabilitada", {
      profileId,
      notificationType,
      template: template ?? "transactional",
    });
    return false;
  }

  // La baja firmada se persiste en email_logs. Aplicar el gate aquí, en el
  // emisor común, evita que un cron o un nuevo caller pueda saltársela.
  if (await hasMarketingOptOut(normalizedRecipient)) {
    logger.info("Email omitido: destinatario dado de baja", { template: template ?? "transactional" });
    return false;
  }

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
      userId: profileId ?? userId ?? null,
      toEmail: normalizedRecipient,
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
      ...(text ? { text } : {}),
      replyTo: replyTo ?? process.env.BREVO_REPLY_TO ?? config.brevo.supportEmail,
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
