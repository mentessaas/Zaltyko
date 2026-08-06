export function AttendanceReminderTemplate({
  athleteName,
  className,
  sessionDate,
  sessionTime,
  academyName,
}: {
  athleteName: string;
  className: string;
  sessionDate: string;
  sessionTime?: string;
  academyName: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recordatorio de Clase</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 30px; text-align: center; background-color: #4f46e5; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Recordatorio de Clase</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                Hola,
              </p>
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                Te recordamos que <strong>${athleteName}</strong> tiene clase de <strong>${className}</strong> el día <strong>${sessionDate}</strong>${sessionTime ? ` a las ${sessionTime}` : ""}.
              </p>
              <div style="background-color: #f3f4f6; border-radius: 6px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600; text-transform: uppercase;">Detalles de la clase</p>
                <p style="margin: 5px 0; color: #111827; font-size: 16px;"><strong>Clase:</strong> ${className}</p>
                <p style="margin: 5px 0; color: #111827; font-size: 16px;"><strong>Fecha:</strong> ${sessionDate}</p>
                ${sessionTime ? `<p style="margin: 5px 0; color: #111827; font-size: 16px;"><strong>Hora:</strong> ${sessionTime}</p>` : ""}
                <p style="margin: 5px 0; color: #111827; font-size: 16px;"><strong>Academia:</strong> ${academyName}</p>
              </div>
              <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                Si tienes alguna pregunta o necesitas cancelar la clase, por favor contacta con la academia.
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

