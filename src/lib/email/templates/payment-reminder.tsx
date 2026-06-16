export function PaymentReminderTemplate({
  athleteName,
  amount,
  dueDate,
  academyName,
  paymentUrl,
}: {
  athleteName: string;
  amount: number;
  dueDate: string;
  academyName: string;
  paymentUrl?: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recordatorio de Pago</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 30px; text-align: center; background-color: #dc2626; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Recordatorio de Pago</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                Hola,
              </p>
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
                Te recordamos que tienes un pago pendiente para <strong>${athleteName}</strong>.
              </p>
              <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 6px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #991b1b; font-size: 14px; font-weight: 600; text-transform: uppercase;">Detalles del Pago</p>
                <p style="margin: 5px 0; color: #111827; font-size: 18px; font-weight: 600;"><strong>Monto:</strong> ${amount.toFixed(2)} €</p>
                <p style="margin: 5px 0; color: #111827; font-size: 16px;"><strong>Fecha de Vencimiento:</strong> ${dueDate}</p>
                <p style="margin: 5px 0; color: #111827; font-size: 16px;"><strong>Academia:</strong> ${academyName}</p>
              </div>
              ${paymentUrl ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${paymentUrl}" style="display: inline-block; padding: 12px 24px; background-color: #dc2626; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Realizar Pago</a>
              </div>
              ` : ""}
              <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                Si ya realizaste el pago, por favor ignora este mensaje. Si tienes alguna pregunta, contacta con la academia.
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
