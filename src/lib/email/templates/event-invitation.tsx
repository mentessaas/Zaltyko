export function EventInvitationTemplate({
  eventName,
  eventDate,
  eventTime,
  eventLocation,
  academyName,
  rsvpUrl,
}: {
  eventName: string;
  eventDate: string;
  eventTime?: string;
  eventLocation?: string;
  academyName: string;
  rsvpUrl?: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación a Evento</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 30px; text-align: center; background-color: #10b981; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">¡Estás Invitado!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                Hola,
              </p>
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                <strong>${academyName}</strong> te invita a participar en:
              </p>
              <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 6px; padding: 20px; margin: 20px 0;">
                <h2 style="margin: 0 0 15px 0; color: #111827; font-size: 20px; font-weight: 600;">${eventName}</h2>
                <p style="margin: 5px 0; color: #111827; font-size: 16px;"><strong>📅 Fecha:</strong> ${eventDate}</p>
                ${eventTime ? `<p style="margin: 5px 0; color: #111827; font-size: 16px;"><strong>🕐 Hora:</strong> ${eventTime}</p>` : ""}
                ${eventLocation ? `<p style="margin: 5px 0; color: #111827; font-size: 16px;"><strong>📍 Ubicación:</strong> ${eventLocation}</p>` : ""}
              </div>
              ${rsvpUrl ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${rsvpUrl}" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Confirmar Asistencia</a>
              </div>
              ` : ""}
              <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                Esperamos verte allí. Si tienes alguna pregunta, no dudes en contactarnos.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px; text-align: center; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                Este es un mensaje automático de ${academyName}. Por favor no respondas a este correo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
