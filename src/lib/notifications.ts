/**
 * Notification System
 * 
 * Academy owners can notify parents via:
 * 1. In-App notification (always available)
 * 2. Email (via Brevo - academy configured)
 * 3. WhatsApp (optional - academy can connect their Twilio)
 */

import { sendBrevoEmail } from "./brevo";

export type NotificationChannel = "in_app" | "email" | "whatsapp";

export interface Notification {
  to: string; // parent email/phone
  type: "attendance" | "payment" | "class" | "general";
  title: string;
  body: string;
  channel: NotificationChannel;
}

/**
 * Send notification to parent
 * Academy owner selects channel in dashboard
 */
export async function sendNotification(
  notification: Notification,
  academyConfig?: {
    brevoApiKey?: string;
    twilioConfig?: { accountSid: string; authToken: string; from: string };
  }
): Promise<{ success: boolean; error?: string }> {
  
  switch (notification.channel) {
    case "email":
      return await sendEmailNotification(notification, academyConfig?.brevoApiKey);
    
    case "whatsapp":
      // Twilio integration - optional
      return { success: false, error: "WhatsApp not configured" };
    
    case "in_app":
    default:
      // Store in database for parent portal
      return await storeInAppNotification(notification);
  }
}

// Email notification
async function sendEmailNotification(
  notification: Notification,
  apiKey?: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey) {
    return { success: false, error: "Email not configured for academy" };
  }
  
  // Use Brevo to send
  // Implementation here...
  return { success: true };
}

// In-App notification  
async function storeInAppNotification(
  notification: Notification
): Promise<{ success: boolean; error?: string }> {
  // Store in database for parent to see in portal
  console.log("[In-App Notification]:", notification);
  return { success: true };
}

// Notification templates
export const NotificationTemplates = {
  attendance: {
    present: (childName: string) => ({
      title: "Asistencia",
      body: `${childName} ha asistido a clase hoy.`
    }),
    absent: (childName: string) => ({
      title: "Asistencia",
      body: `${childName} no ha asistido a clase hoy.`
    })
  },
  
  payment: {
    reminder: (childName: string, amount: number, dueDate: string) => ({
      title: "Recordatorio de pago",
      body: `La mensualidad de ${childName} (€${amount}) vence el ${dueDate}.`
    })
  },
  
  class: {
    reminder: (childName: string, className: string, time: string) => ({
      title: "Recordatorio de clase",
      body: `${childName} tiene ${className} a las ${time}.`
    })
  }
};
