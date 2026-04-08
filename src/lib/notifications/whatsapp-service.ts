/**
 * WhatsApp Service
 *
 * Handles WhatsApp message sending with template support from database.
 * Falls back to built-in templates if database templates not found.
 */

import { db } from "@/db";
import { messageTemplates } from "@/db/schema/communication";
import { eq, and } from "drizzle-orm";
import { sendWhatsApp } from "@/lib/whatsapp";
import type { InferSelectModel } from "drizzle-orm";

export type WhatsAppTemplateRecord = InferSelectModel<typeof messageTemplates>;

// Default templates (used when DB doesn't have them)
const DEFAULT_TEMPLATES = {
  attendancePresent: {
    name: "Attendance Present",
    description: "Notificación de asistencia",
    channel: "whatsapp",
    templateType: "attendance_present",
    subject: "",
    body: "📅 {{childName}} ha asistido a clase hoy.",
    variables: ["childName"],
  },
  attendanceAbsent: {
    name: "Attendance Absent",
    description: "Notificación de ausencia",
    channel: "whatsapp",
    templateType: "attendance_absent",
    subject: "",
    body: "📅 {{childName}} no ha asistido a clase hoy.",
    variables: ["childName"],
  },
  paymentReminder: {
    name: "Payment Reminder",
    description: "Recordatorio de pago",
    channel: "whatsapp",
    templateType: "payment_reminder",
    subject: "",
    body: "💰 Recordatorio: La mensualidad de {{childName}} ({{currency}}{{amount}}) vence el {{dueDate}}.",
    variables: ["childName", "amount", "dueDate", "currency"],
  },
  classReminder: {
    name: "Class Reminder",
    description: "Recordatorio de clase",
    channel: "whatsapp",
    templateType: "class_reminder",
    subject: "",
    body: "🩰 Recordatorio: {{childName}} tiene {{className}} el {{day}} a las {{time}}.",
    variables: ["childName", "className", "day", "time"],
  },
  welcome: {
    name: "Welcome Message",
    description: "Mensaje de bienvenida",
    channel: "whatsapp",
    templateType: "welcome",
    subject: "",
    body: "👋 Hola {{parentName}}! Bienvenido/a a {{academyName}}. {{childName}} ya está matriculado/a.",
    variables: ["parentName", "childName", "academyName"],
  },
};

interface SendWhatsAppOptions {
  to: string;
  templateType: keyof typeof DEFAULT_TEMPLATES;
  variables: Record<string, string>;
  tenantId?: string;
  academyTwilioConfig?: { accountSid: string; authToken: string; from: string };
}

/**
 * Send WhatsApp message using a template from DB (or default)
 */
export async function sendWhatsAppWithTemplate(options: SendWhatsAppOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const { to, templateType, variables, academyTwilioConfig } = options;

  // Try to get template from DB
  let template = await getWhatsAppTemplateByType(templateType);

  // Fall back to default template
  if (!template) {
    const defaultTemplate = DEFAULT_TEMPLATES[templateType];
    if (!defaultTemplate) {
      return { success: false, error: `Template ${templateType} not found` };
    }
    template = defaultTemplate as WhatsAppTemplateRecord;
  }

  // Interpolate variables
  const body = interpolateTemplate(template.body, variables);

  // Send the message
  return sendWhatsApp(to, body, academyTwilioConfig);
}

/**
 * Get WhatsApp template by type from DB
 */
export async function getWhatsAppTemplateByType(templateType: string): Promise<WhatsAppTemplateRecord | null> {
  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.channel, "whatsapp"),
        eq(messageTemplates.templateType, templateType),
        eq(messageTemplates.isActive, true)
      )
    );
  return template || null;
}

/**
 * Get all WhatsApp templates
 */
export async function getWhatsAppTemplates(tenantId?: string) {
  return db
    .select()
    .from(messageTemplates)
    .where(
      tenantId
        ? and(
            eq(messageTemplates.channel, "whatsapp"),
            eq(messageTemplates.tenantId, tenantId)
          )
        : eq(messageTemplates.channel, "whatsapp")
    );
}

/**
 * Seed default WhatsApp templates for a tenant
 */
export async function seedWhatsAppTemplates(tenantId: string) {
  const results = [];

  for (const [key, template] of Object.entries(DEFAULT_TEMPLATES)) {
    // Check if already exists
    const existing = await db
      .select()
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.tenantId, tenantId),
          eq(messageTemplates.templateType, key)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      const [created] = await db
        .insert(messageTemplates)
        .values({
          tenantId,
          ...template,
          isSystem: true,
          isActive: true,
        })
        .returning();
      results.push(created);
    }
  }

  return results;
}

/**
 * Interpolate template variables
 */
function interpolateTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

// Legacy export for backwards compatibility
export const WhatsAppTemplates = {
  attendancePresent: (childName: string) =>
    DEFAULT_TEMPLATES.attendancePresent.body.replace("{{childName}}", childName),

  attendanceAbsent: (childName: string) =>
    DEFAULT_TEMPLATES.attendanceAbsent.body.replace("{{childName}}", childName),

  paymentReminder: (childName: string, amount: number, dueDate: string) =>
    DEFAULT_TEMPLATES.paymentReminder.body
      .replace("{{childName}}", childName)
      .replace("{{amount}}", String(amount))
      .replace("{{dueDate}}", dueDate)
      .replace("{{currency}}", "€"),

  classReminder: (childName: string, className: string, time: string, day: string) =>
    DEFAULT_TEMPLATES.classReminder.body
      .replace("{{childName}}", childName)
      .replace("{{className}}", className)
      .replace("{{day}}", day)
      .replace("{{time}}", time),

  welcome: (parentName: string, childName: string, academyName: string) =>
    DEFAULT_TEMPLATES.welcome.body
      .replace("{{parentName}}", parentName)
      .replace("{{childName}}", childName)
      .replace("{{academyName}}", academyName),
};
