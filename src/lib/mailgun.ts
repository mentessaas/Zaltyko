import { config } from "@/config";
import formData from "form-data";
import Mailgun from "mailgun.js";
import { getOptionalEnvVar, isDevelopment } from "@/lib/env";
import { isValidEmail, normalizeEmail } from "@/lib/validation/email-utils";

const mailgun = new Mailgun(formData);

const mailgunApiKey = getOptionalEnvVar("MAILGUN_API_KEY") || "dummy";
const mailgunDomain = config.domainName?.replace(/^https?:\/\//, "") ?? "";
const hasMailgunCredentials = Boolean(mailgunApiKey && mailgunApiKey !== "dummy" && mailgunDomain);

const mg = mailgun.client({
  username: "api",
  key: mailgunApiKey,
});

if (!hasMailgunCredentials && isDevelopment()) {
  console.group("⚠️ MAILGUN no configurado");
  console.warn("MAILGUN_API_KEY o domainName faltan. Se omitirá el envío real de correos en desarrollo.");
  console.groupEnd();
}

/**
 * Sends an email using the provided parameters.
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
}) => {
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
  
  if (!hasMailgunCredentials) {
    if (isDevelopment()) {
      console.info("[mailgun] Envío simulado (sin credenciales).", { to, subject });
    }
    return;
  }
  
  // Normalizar email del destinatario
  const normalizedTo = normalizeEmail(to);
  if (!normalizedTo) {
    throw new Error("No se pudo normalizar el email del destinatario");
  }

  const data = {
    from: config.mailgun.fromAdmin,
    to: [normalizedTo],
    subject: subject.trim(),
    text: text?.trim(),
    html: html.trim(),
    ...(replyTo && { "h:Reply-To": normalizeEmail(replyTo) || replyTo }),
  };

  const domain = `${config.mailgun.subdomain ? `${config.mailgun.subdomain}.` : ""}${mailgunDomain}`;

  await mg.messages.create(domain, data);
};
