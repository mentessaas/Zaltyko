import { isValidEmail, normalizeEmail } from "@/lib/validation/email-utils";
import { getFeatureReadiness, isDevelopment, isTest } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Sends an email using Brevo SMTP API.
 *
 * @async
 * @param {string} to - The recipient's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} text - The plain text content of the email.
 * @param {string} html - The HTML content of the email.
 * @param {string} replyTo - The email address to set as the "Reply-To" address.
 * @returns {Promise} A Promise that resolves when the email is sent.
 * @throws {Error} Si los parámetros de entrada no son válidos
 */
export const sendEmail = async ({
  html,
  replyTo,
  subject,
  text,
  to,
}: {
  to: string;
  subject: string;
  text?: string;
  html: string;
  replyTo: string;
}): Promise<{ messageId: string | null; simulated: boolean }> => {
  // Validar parámetros de entrada
  if (!to || typeof to !== "string" || !to.trim()) {
    throw new Error("El campo 'to' (destinatario) es requerido");
  }

  if (!isValidEmail(to)) {
    throw new Error(`El email del destinatario no es válido: ${to}`);
  }

  if (!subject || typeof subject !== "string" || !subject.trim()) {
    throw new Error("El campo 'subject' (asunto) es requerido y no puede estar vacío");
  }

  if (!html || typeof html !== "string" || !html.trim()) {
    throw new Error("El campo 'html' (contenido HTML) es requerido y no puede estar vacío");
  }

  if (replyTo && !isValidEmail(replyTo)) {
    throw new Error(`El email 'replyTo' no es válido: ${replyTo}`);
  }

  const readiness = getFeatureReadiness("email");
  if (!readiness.ready) {
    if (isDevelopment() || isTest()) {
      logger.warn("Brevo no configurado; envío simulado en desarrollo", {
        missing: readiness.missing,
      });
      return { messageId: null, simulated: true };
    }
    throw new Error(`EMAIL_NOT_CONFIGURED:${readiness.missing.join(",")}`);
  }

  const apiKey = process.env.BREVO_API_KEY!;
  const senderEmail = process.env.BREVO_SENDER_EMAIL!;
  const senderName = process.env.BREVO_SENDER_NAME!;

  // Normalizar email del destinatario
  const normalizedTo = normalizeEmail(to);
  if (!normalizedTo) {
    throw new Error("No se pudo normalizar el email del destinatario");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: normalizedTo }],
      subject: subject.trim(),
      htmlContent: html.trim(),
      textContent: text?.trim(),
      replyTo: replyTo ? { email: normalizeEmail(replyTo) || replyTo } : undefined,
    }),
  });

  if (!response.ok) {
    // El body del proveedor puede repetir destinatarios o contenido. No lo
    // propagamos a logs ni al ledger de email.
    throw new Error(`BREVO_API_ERROR:${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as { messageId?: string } | null;
  return { messageId: payload?.messageId ?? null, simulated: false };
};
