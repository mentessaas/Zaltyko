/**
 * WhatsApp Integration via Twilio
 * Sends WhatsApp notifications to parents
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;

interface WhatsAppMessage {
  to: string;
  body: string;
}

export async function sendWhatsApp(message: WhatsAppMessage): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    console.warn("Twilio not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          From: TWILIO_WHATSAPP_FROM,
          To: `whatsapp:${message.to}`,
          Body: message.body,
        }),
      }
    );

    const data = await response.json();
    
    if (data.sid) {
      console.log(`[WhatsApp] Sent: ${data.sid}`);
      return true;
    }
    
    console.error("[WhatsApp] Error:", data);
    return false;
  } catch (error) {
    console.error("[WhatsApp] Failed:", error);
    return false;
  }
}

// Template messages
export const WhatsAppTemplates = {
  welcome: (parentName: string, childName: string, academyName: string) =>
    `👋 Hola ${parentName}! Bienvenido a ${academyName}. Tu hijo/a ${childName} está matriculado/a.有任何问题, responde a este mensaje.`,

  paymentReminder: (parentName: string, amount: number, dueDate: string) =>
    `💰 ${parentName}, te recordamos que tienes un pago pendiente de €${amount} vence el ${dueDate}. Paga en: zaltyko.vercel.app`,

  attendance: (parentName: string, childName: string, status: "present" | "absent") =>
    `📅 ${parentName}, ${childName} ${status === "present" ? "asistió" : "no asistió"} a clase hoy.`,
    
  classReminder: (parentName: string, childName: string, className: string, time: string) =>
    `🩰 ${parentName}, recordatorio: ${childName} tiene ${className} mañana a las ${time}.`,
};
