/**
 * Email Templates Service
 *
 * Handles email template management in database,
 * with fallback to React Email components for rendering.
 */

import { db } from "@/db";
import { messageTemplates } from "@/db/schema/communication";
import { eq, and } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type EmailTemplateRecord = InferSelectModel<typeof messageTemplates>;

// Default email templates
const DEFAULT_EMAIL_TEMPLATES = {
  attendanceReminder: {
    name: "Attendance Reminder",
    description: "Recordatorio de asistencia a clase",
    channel: "email",
    templateType: "attendance_reminder",
    subject: "Recordatorio de Clase - {{academyName}}",
    body: `Hola,

Te recordamos que {{athleteName}} tiene clase de {{className}} el día {{sessionDate}}{{sessionTime}} a las {{sessionTime}}.

Detalles de la clase:
- Clase: {{className}}
- Fecha: {{sessionDate}}
- Hora: {{sessionTime}}
- Academia: {{academyName}}

Si tienes alguna pregunta o necesitas cancelar la clase, por favor contacta con la academia.

Saludos,
{{academyName}}`,
    variables: ["athleteName", "className", "sessionDate", "sessionTime", "academyName"],
    isSystem: true,
    isActive: true,
  },

  paymentReminder: {
    name: "Payment Reminder",
    description: "Recordatorio de pago pendiente",
    channel: "email",
    templateType: "payment_reminder",
    subject: "Recordatorio de Pago - {{academyName}}",
    body: `Hola {{parentName}},

Este es un recordatorio de que existe un pago pendiente para {{athleteName}}.

Detalles del pago:
- Concepto: {{concept}}
- Importe: {{currency}}{{amount}}
- Fecha límite: {{dueDate}}

Por favor, realiza el pago antes de la fecha límite para evitar interrupciones en el servicio.

Si ya has realizado el pago, por favor ignora este mensaje o contacta con la academia para confirmar.

Saludos,
{{academyName}}`,
    variables: ["parentName", "athleteName", "concept", "amount", "dueDate", "currency", "academyName"],
    isSystem: true,
    isActive: true,
  },

  eventInvitation: {
    name: "Event Invitation",
    description: "Invitación a evento",
    channel: "email",
    templateType: "event_invitation",
    subject: "Invitación: {{eventName}} - {{academyName}}",
    body: `Hola {{parentName}},

Estás cordialmente invitado/a al evento {{eventName}} organizado por {{academyName}}.

Detalles del evento:
- Nombre: {{eventName}}
- Fecha: {{eventDate}}
- Hora: {{eventTime}}
- Lugar: {{eventLocation}}
- Descripción: {{eventDescription}}

Confirmar asistencia: {{confirmationLink}}

¡Esperamos verte allí!

Saludos,
{{academyName}}`,
    variables: ["parentName", "eventName", "eventDate", "eventTime", "eventLocation", "eventDescription", "confirmationLink", "academyName"],
    isSystem: true,
    isActive: true,
  },

  classCancellation: {
    name: "Class Cancellation",
    description: "Cancelación de clase",
    channel: "email",
    templateType: "class_cancellation",
    subject: "Cancelación de Clase - {{academyName}}",
    body: `Hola {{parentName}},

Lamentamos informarte que la clase de {{className}} programada para el {{sessionDate}} a las {{sessionTime}} ha sido cancelada.

Razón: {{cancellationReason}}

Detalles de la clase cancelada:
- Clase: {{className}}
- Fecha: {{sessionDate}}
- Hora: {{sessionTime}}
- Profesor: {{coachName}}

Se informará sobre la reposición de esta clase en breve.

Disculpa las molestias,
{{academyName}}`,
    variables: ["parentName", "className", "sessionDate", "sessionTime", "cancellationReason", "coachName", "academyName"],
    isSystem: true,
    isActive: true,
  },

  welcomeEmail: {
    name: "Welcome Email",
    description: "Email de bienvenida",
    channel: "email",
    templateType: "welcome_email",
    subject: "Bienvenido/a a {{academyName}}",
    body: `Hola {{parentName}},

¡Bienvenido/a a {{academyName}}!

Nos alegra mucho tener a {{athleteName}} como parte de nuestra academia.

Resumen de la inscripción:
- Atleta: {{athleteName}}
- Nivel: {{level}}
- Clase: {{className}}
- Horario: {{schedule}}

Estamos comprometidos con la excelencia en la enseñanza de la gimnasia y esperamos que {{athleteName}} disfrute de su aprendizaje con nosotros.

 Próximos pasos:
1. Uniforme: {{uniformInfo}}
2. Horarios de clase: {{scheduleDetails}}
3. Contacto: {{contactInfo}}

Si tienes alguna pregunta, no dudes en contactarnos.

Saludos cordiales,
{{academyName}}`,
    variables: ["parentName", "athleteName", "academyName", "level", "className", "schedule", "uniformInfo", "scheduleDetails", "contactInfo"],
    isSystem: true,
    isActive: true,
  },
};

interface SendEmailOptions {
  to: string;
  templateType: keyof typeof DEFAULT_EMAIL_TEMPLATES;
  variables: Record<string, string>;
  tenantId?: string;
  replyTo?: string;
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

/**
 * Get email template by type from DB
 */
export async function getEmailTemplateByType(templateType: string): Promise<EmailTemplateRecord | null> {
  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.channel, "email"),
        eq(messageTemplates.templateType, templateType),
        eq(messageTemplates.isActive, true)
      )
    );
  return template || null;
}

/**
 * Get all email templates
 */
export async function getEmailTemplates(tenantId?: string) {
  return db
    .select()
    .from(messageTemplates)
    .where(
      tenantId
        ? and(
            eq(messageTemplates.channel, "email"),
            eq(messageTemplates.tenantId, tenantId)
          )
        : eq(messageTemplates.channel, "email")
    );
}

/**
 * Seed default email templates for a tenant
 */
export async function seedEmailTemplates(tenantId: string) {
  const results = [];

  for (const [key, template] of Object.entries(DEFAULT_EMAIL_TEMPLATES)) {
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
        })
        .returning();
      results.push(created);
    }
  }

  return results;
}

/**
 * Get template and interpolate variables
 */
export async function getInterpolatedTemplate(
  templateType: keyof typeof DEFAULT_EMAIL_TEMPLATES,
  variables: Record<string, string>
): Promise<{ subject: string; body: string }> {
  // Try to get from DB first
  let template = await getEmailTemplateByType(templateType);

  // Fall back to default
  if (!template) {
    const defaultTemplate = DEFAULT_EMAIL_TEMPLATES[templateType];
    if (!defaultTemplate) {
      return { subject: "Notification", body: "You have a new notification." };
    }
    return {
      subject: interpolateTemplate(defaultTemplate.subject, variables),
      body: interpolateTemplate(defaultTemplate.body, variables),
    };
  }

  return {
    subject: interpolateTemplate(template.subject || "", variables),
    body: interpolateTemplate(template.body, variables),
  };
}

export { DEFAULT_EMAIL_TEMPLATES };
