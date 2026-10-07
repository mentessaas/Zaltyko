import { escapeHtml } from "../escape-html";

export function ClassCancellationTemplate({
  athleteName,
  className,
  sessionDate,
  sessionTime,
  academyName,
  reason,
}: {
  athleteName: string;
  className: string;
  sessionDate: string;
  sessionTime?: string;
  academyName: string;
  reason?: string;
}) {
  const safeAthleteName = escapeHtml(athleteName);
  const safeClassName = escapeHtml(className);
  const safeSessionDate = escapeHtml(sessionDate);
  const safeSessionTime = sessionTime ? escapeHtml(sessionTime) : undefined;
  const safeAcademyName = escapeHtml(academyName);
  const safeReason = reason ? escapeHtml(reason) : undefined;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clase Cancelada</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F8F7F3;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #DEDCD3; border-radius: 18px; box-shadow: 0 8px 24px rgba(22,36,58,0.08);">
          <tr>
            <td style="padding: 32px 30px; text-align: center; background-color: #16243A; border-radius: 18px 18px 0 0;">
              <p style="margin: 0 0 10px; color: #D5E776; font-size: 12px; font-weight: 700; letter-spacing: 2px;">ZALTYKO</p>
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Clase cancelada</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #53616B; font-size: 16px; line-height: 1.6;">
                Hola,
              </p>
              <p style="margin: 0 0 20px 0; color: #53616B; font-size: 16px; line-height: 1.6;">
                Lamentamos informarte que la clase de <strong>${safeClassName}</strong> programada para <strong>${safeAthleteName}</strong> el día <strong>${safeSessionDate}</strong>${safeSessionTime ? ` a las ${safeSessionTime}` : ""} ha sido cancelada.
              </p>
              <div style="background-color: #F5F1DF; border-left: 4px solid #A07A2D; border-radius: 12px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #735B25; font-size: 13px; font-weight: 700; text-transform: uppercase;">Detalles de la clase</p>
                <p style="margin: 5px 0; color: #16243A; font-size: 16px;"><strong>Clase:</strong> ${safeClassName}</p>
                <p style="margin: 5px 0; color: #16243A; font-size: 16px;"><strong>Fecha:</strong> ${safeSessionDate}</p>
                ${safeSessionTime ? `<p style="margin: 5px 0; color: #16243A; font-size: 16px;"><strong>Hora:</strong> ${safeSessionTime}</p>` : ""}
                <p style="margin: 5px 0; color: #16243A; font-size: 16px;"><strong>Academia:</strong> ${safeAcademyName}</p>
                ${safeReason ? `<p style="margin: 10px 0 0 0; color: #16243A; font-size: 14px;"><strong>Motivo:</strong> ${safeReason}</p>` : ""}
              </div>
              <p style="margin: 20px 0 0 0; color: #53616B; font-size: 14px; line-height: 1.6;">
                Si tienes alguna pregunta o necesitas reprogramar, por favor contacta con la academia.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px; text-align: center; background-color: #F8F7F3; border-radius: 0 0 18px 18px; border-top: 1px solid #DEDCD3;">
              <p style="margin: 0; color: #53616B; font-size: 12px;">
                Este es un mensaje automático de ${safeAcademyName}. Por favor no respondas a este correo.
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
