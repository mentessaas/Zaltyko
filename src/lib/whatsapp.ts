/**
 * WhatsApp Integration via Twilio
 * 
 * IMPORTANT: This is for the ACADEMY to send messages to parents.
 * We (Zaltyko) do NOT send messages to parents - we only email academy owners.
 * 
 * The academy configures their Twilio credentials and sends via our API.
 */

import { normalizeCountryCode } from "@/lib/specialization/registry";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;

const COUNTRY_CALLING_CODES: Record<string, string> = {
  ES: "34", MX: "52", AR: "54", CO: "57", CL: "56", PE: "51", VE: "58",
  EC: "593", GT: "502", CU: "53", BO: "591", DO: "1", HN: "504", PY: "595", PR: "1",
  NI: "505", CR: "506", UY: "598", PA: "507", SV: "503", US: "1",
};

export function formatPhoneForWhatsApp(phone: string, countryCode = "ES"): string {
  const raw = phone.trim();
  if (raw.startsWith("+")) return raw.slice(1).replace(/\D/g, "");
  if (raw.startsWith("00")) return raw.slice(2).replace(/\D/g, "");

  const digits = raw.replace(/\D/g, "");
  const normalizedCountryCode = normalizeCountryCode(countryCode) ?? "ES";
  const callingCode = COUNTRY_CALLING_CODES[normalizedCountryCode] ?? "34";
  if (digits.startsWith(callingCode)) return digits;
  return `${callingCode}${digits}`;
}

/**
 * Send WhatsApp message from academy to parent
 * Academy owner triggers this via Zaltyko dashboard
 */
export async function sendWhatsApp(
  to: string, 
  body: string, 
  academyTwilioConfig?: { accountSid: string; authToken: string; from: string; countryCode?: string | null }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  
  // Use academy-specific config or default (Zaltyko's)
  const accountSid = academyTwilioConfig?.accountSid || TWILIO_ACCOUNT_SID;
  const authToken = academyTwilioConfig?.authToken || TWILIO_AUTH_TOKEN;
  const from = academyTwilioConfig?.from || TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    return { success: false, error: "Twilio not configured for this academy" };
  }

  try {
    // Format phone
    const formattedPhone = formatPhoneForWhatsApp(to, academyTwilioConfig?.countryCode ?? "ES");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          From: from,
          To: `whatsapp:${formattedPhone}`,
          Body: body,
        }),
      }
    );

    const data = await response.json();
    
    if (data.sid) {
      return { success: true, messageId: data.sid };
    }
    
    return { success: false, error: data.message || "Unknown error" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Templates for academy to use - these go in the UI for academy owners to select
export const WhatsAppTemplates = {
  attendancePresent: (childName: string) =>
    `📅 ${childName} ha asistido a clase hoy.`,

  attendanceAbsent: (childName: string) =>
    `📅 ${childName} no ha asistido a clase hoy.`,

  paymentReminder: (childName: string, amount: number, dueDate: string, currency = "€") =>
    `💰 Recordatorio: La mensualidad de ${childName} (${currency}${amount}) vence el ${dueDate}.`,

  classReminder: (childName: string, className: string, time: string, day: string) =>
    `🩰 Recordatorio: ${childName} tiene ${className} el ${day} a las ${time}.`,

  welcome: (parentName: string, childName: string, academyName: string) =>
    `👋 Hola ${parentName}! Bienvenido/a a ${academyName}. ${childName} ya está matriculado/a.`,
};
