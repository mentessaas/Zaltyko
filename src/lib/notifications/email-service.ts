import { config } from "@/config";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  sent: number;
  errors: number;
  failedEmails: string[];
}

export interface BulkEmailDeliveryContext {
  tenantId?: string;
  academyId?: string;
  template?: string;
  dedupeKeyPrefix?: string;
}

/**
 * Envía emails a múltiples destinatarios y retorna un resumen de resultados
 */
export async function sendBulkEmails(
  recipients: string[],
  content: EmailContent,
  replyTo?: string,
  deliveryContext?: BulkEmailDeliveryContext
): Promise<SendEmailResult> {
  if (recipients.length === 0) {
    return { sent: 0, errors: 0, failedEmails: [] };
  }

  const failedEmails: string[] = [];
  let sent = 0;
  let errors = 0;

  for (const email of recipients) {
    try {
      const delivered = await sendEmailWithLogging({
        to: email,
        subject: content.subject,
        html: content.html,
        text: content.text,
        replyTo: replyTo || config.brevo.supportEmail,
        tenantId: deliveryContext?.tenantId,
        academyId: deliveryContext?.academyId,
        template: deliveryContext?.template ?? "event_notification",
        dedupeKey: deliveryContext?.dedupeKeyPrefix
          ? `${deliveryContext.dedupeKeyPrefix}:${email.trim().toLowerCase()}`
          : undefined,
      });
      if (delivered) sent++;
    } catch (error) {
      logger.error(`Error enviando email a ${email}`, error as Error, { email, recipient: email });
      errors++;
      failedEmails.push(email);
    }
  }

  return { sent, errors, failedEmails };
}
