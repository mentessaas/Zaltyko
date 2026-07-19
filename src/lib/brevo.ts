import { parseMailbox } from "@/lib/email/mailbox";
import { isValidEmail, normalizeEmail } from "@/lib/validation/email-utils";
import { isDevelopment } from "@/lib/env";
import { logger } from "@/lib/logger";

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "admin@zaltyko.com";
const SENDER_NAME = process.env.BREVO_SENDER_NAME || "Zaltyko";
const hasBrevoCredentials = Boolean(BREVO_API_KEY);

if (!hasBrevoCredentials && isDevelopment()) {
  console.group("⚠️ BREVO no configurado");
  logger.warn("BREVO_API_KEY falta. Se omitirá el envío real de correos en desarrollo.");
  console.groupEnd();
}

/**
 * Sends an email using Brevo's transactional email API.
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
}) => {
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

  const parsedReplyTo = replyTo ? parseMailbox(replyTo) : null;
  if (replyTo && !parsedReplyTo) {
    throw new Error(`El email 'replyTo' no es válido: ${replyTo}`);
  }

  if (!hasBrevoCredentials) {
    if (isDevelopment()) {
      console.info("[brevo] Envío simulado (sin credenciales).", { to, subject });
      return;
    }

    throw new Error("BREVO_API_KEY no está configurada; el email no fue enviado");
  }

  const normalizedTo = normalizeEmail(to);
  if (!normalizedTo) {
    throw new Error("No se pudo normalizar el email del destinatario");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: normalizedTo }],
      subject: subject.trim(),
      htmlContent: html.trim(),
      textContent: text?.trim(),
      replyTo: parsedReplyTo || undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error: ${response.status} - ${errorText}`);
  }
};
