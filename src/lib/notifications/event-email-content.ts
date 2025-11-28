import { config } from "@/config";

export interface EventData {
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactWebsite: string | null;
}

export type NotificationType = "internal" | "city" | "province" | "country";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Genera el contenido del email de notificación de evento
 */
export function generateEventEmailContent(
  event: EventData,
  academyName: string,
  notificationType: NotificationType
): EmailContent {
  const locationText = [event.city, event.province, event.country]
    .filter(Boolean)
    .join(", ");

  const dateText = event.startDate
    ? event.endDate && event.endDate !== event.startDate
      ? `Del ${new Date(event.startDate).toLocaleDateString("es-ES")} al ${new Date(event.endDate).toLocaleDateString("es-ES")}`
      : `El ${new Date(event.startDate).toLocaleDateString("es-ES")}`
    : "Fecha por confirmar";

  const notificationTypeText = {
    internal: "personal interno",
    city: "academias de tu ciudad",
    province: "academias de tu provincia",
    country: "academias de tu país",
  }[notificationType];

  const subject = `Nuevo evento: ${event.title} - ${academyName}`;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Nuevo evento de ${academyName}</h2>
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #1f2937; margin-top: 0;">${event.title}</h3>
        ${event.description ? `<p style="color: #4b5563; line-height: 1.6;">${event.description}</p>` : ""}
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; margin: 8px 0;"><strong>Fecha:</strong> ${dateText}</p>
          ${locationText ? `<p style="color: #6b7280; margin: 8px 0;"><strong>Ubicación:</strong> ${locationText}</p>` : ""}
          ${event.contactEmail ? `<p style="color: #6b7280; margin: 8px 0;"><strong>Contacto:</strong> ${event.contactEmail}</p>` : ""}
          ${event.contactPhone ? `<p style="color: #6b7280; margin: 8px 0;"><strong>Teléfono:</strong> ${event.contactPhone}</p>` : ""}
          ${event.contactWebsite ? `<p style="color: #6b7280; margin: 8px 0;"><strong>Web:</strong> <a href="${event.contactWebsite}" style="color: #0D47A1;">${event.contactWebsite}</a></p>` : ""}
        </div>
      </div>
      <p style="color: #6b7280; font-size: 12px;">
        Has recibido esta notificación porque formas parte del ${notificationTypeText} de ${academyName}.
      </p>
      <p style="color: #6b7280; font-size: 12px;">
        Si tienes alguna pregunta, puedes responder a este correo o contactarnos en ${config.mailgun.supportEmail}
      </p>
    </div>
  `;

  const text = `
Nuevo evento: ${event.title}

${event.description || ""}

Fecha: ${dateText}
${locationText ? `Ubicación: ${locationText}` : ""}
${event.contactEmail ? `Contacto: ${event.contactEmail}` : ""}
${event.contactPhone ? `Teléfono: ${event.contactPhone}` : ""}
${event.contactWebsite ? `Web: ${event.contactWebsite}` : ""}

Has recibido esta notificación porque formas parte del ${notificationTypeText} de ${academyName}.
  `.trim();

  return { subject, html, text };
}

