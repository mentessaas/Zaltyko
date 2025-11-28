import { sendEmail } from "@/lib/mailgun";
import { config } from "@/config";
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

/**
 * Envía emails a múltiples destinatarios y retorna un resumen de resultados
 */
export async function sendBulkEmails(
  recipients: string[],
  content: EmailContent,
  replyTo?: string
): Promise<SendEmailResult> {
  if (recipients.length === 0) {
    return { sent: 0, errors: 0, failedEmails: [] };
  }

  const failedEmails: string[] = [];
  let sent = 0;
  let errors = 0;

  for (const email of recipients) {
    try {
      await sendEmail({
        to: email,
        subject: content.subject,
        html: content.html,
        text: content.text,
        replyTo: replyTo || config.mailgun.supportEmail,
      });
      sent++;
    } catch (error) {
      logger.error(`Error enviando email a ${email}`, error as Error, { email, recipient: email });
      errors++;
      failedEmails.push(email);
    }
  }

  return { sent, errors, failedEmails };
}

