import { escapeHtml } from "../escape-html";

export function PaymentReminderTemplate({
  athleteName,
  amount,
  currency = "EUR",
  dueDate,
  academyName,
  paymentUrl,
}: {
  athleteName: string;
  amount: number;
  currency?: string;
  dueDate: string;
  academyName: string;
  paymentUrl?: string;
}) {
  const safeAthleteName = escapeHtml(athleteName);
  const safeDueDate = escapeHtml(dueDate);
  const safeAcademyName = escapeHtml(academyName);
  const safeCurrency = escapeHtml(currency.toUpperCase());
  const safePaymentUrl = paymentUrl ? escapeHtml(paymentUrl) : undefined;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recordatorio de Pago</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F8F7F3;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #DEDCD3; border-radius: 18px; box-shadow: 0 8px 24px rgba(22,36,58,0.08);">
          <tr>
            <td style="padding: 32px 30px; text-align: center; background-color: #16243A; border-radius: 18px 18px 0 0;">
              <p style="margin: 0 0 10px; color: #D5E776; font-size: 12px; font-weight: 700; letter-spacing: 2px;">ZALTYKO</p>
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Recordatorio de pago</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #53616B; font-size: 16px; line-height: 1.6;">
                Hola,
              </p>
              <p style="margin: 0 0 20px 0; color: #53616B; font-size: 16px; line-height: 1.6;">
                Te recordamos que tienes un pago pendiente para <strong>${safeAthleteName}</strong>.
              </p>
              <div style="background-color: #E8F1EB; border-left: 4px solid #146F68; border-radius: 12px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #146F68; font-size: 13px; font-weight: 700; text-transform: uppercase;">Detalles del pago</p>
                <p style="margin: 5px 0; color: #16243A; font-size: 18px; font-weight: 600;"><strong>Importe:</strong> ${amount.toFixed(2)} ${safeCurrency}</p>
                <p style="margin: 5px 0; color: #16243A; font-size: 16px;"><strong>Fecha de vencimiento:</strong> ${safeDueDate}</p>
                <p style="margin: 5px 0; color: #16243A; font-size: 16px;"><strong>Academia:</strong> ${safeAcademyName}</p>
              </div>
              ${safePaymentUrl ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${safePaymentUrl}" style="display: inline-block; min-height: 44px; padding: 14px 24px; background-color: #146F68; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700;">Ver opciones de pago</a>
              </div>
              ` : ""}
              <p style="margin: 20px 0 0 0; color: #53616B; font-size: 14px; line-height: 1.6;">
                Si ya realizaste el pago, por favor ignora este mensaje. Si tienes alguna pregunta, contacta con la academia.
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
