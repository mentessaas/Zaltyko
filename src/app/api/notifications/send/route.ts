import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { AttendanceReminderTemplate } from "@/lib/email/templates/attendance-reminder";
import { PaymentReminderTemplate } from "@/lib/email/templates/payment-reminder";
import { EventInvitationTemplate } from "@/lib/email/templates/event-invitation";
import { ClassCancellationTemplate } from "@/lib/email/templates/class-cancellation";
import { logger } from "@/lib/logger";
import { db } from "@/db";
import { academies, notificationPreferences, profiles } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";

const sendSchema = z.object({
  to: z.string().email(),
  academyId: z.string().uuid(),
  template: z.enum(["attendance-reminder", "payment-reminder", "event-invitation", "class-cancellation"]),
  data: z.record(z.unknown()),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  if (!context.profile || !["owner", "admin", "super_admin"].includes(context.profile.role)) {
    return apiError("FORBIDDEN", "No tienes permiso para enviar correos de notificación", 403);
  }

  let body: z.infer<typeof sendSchema>;
  try {
    body = sendSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Datos de notificación inválidos", 400, error.issues);
    }
    return apiError("INVALID_JSON", "JSON inválido", 400);
  }
  const { to, academyId, template, data } = body;

  // Respetar la preferencia de email cuando el caller identifica al
  // destinatario. Los envíos operativos sin userId mantienen compatibilidad,
  // pero nunca se ignora explícitamente un opt-out existente.
  const recipientUserId = typeof data.userId === "string" ? data.userId : undefined;
  let recipientProfileId: string | undefined;
  if (recipientUserId) {
    const [recipientProfile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(
        eq(profiles.tenantId, context.tenantId),
        or(
          eq(profiles.userId, recipientUserId),
          eq(profiles.id, recipientUserId),
        ),
      ))
      .limit(1);
    recipientProfileId = recipientProfile?.id;

    const [emailPreference] = await db
      .select({ enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(and(
        recipientProfileId
          ? eq(notificationPreferences.profileId, recipientProfileId)
          : eq(notificationPreferences.profileId, recipientUserId),
        eq(notificationPreferences.channel, "email"),
      ))
      .limit(1);
    if (emailPreference && !emailPreference.enabled) {
      return apiSuccess({ ok: true, skipped: "EMAIL_PREFERENCE_DISABLED" });
    }
  }

  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.id, academyId), eq(academies.tenantId, context.tenantId)))
    .limit(1);
  if (!academy) {
    return apiError("FORBIDDEN", "La academia no pertenece al tenant activo", 403);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: context.tenantId,
    academyId,
    permission: "communications:send",
  });
  if (!scope.allowed) {
    return apiError("FORBIDDEN", "No tienes permiso para enviar correos de esta academia", 403);
  }

  let html: string;
  let subject: string;
  const notificationType = {
    "attendance-reminder": "class_reminder",
    "payment-reminder": "invoice_pending",
    "event-invitation": "event",
    "class-cancellation": "schedule_change",
  }[template];

  switch (template) {
    case "attendance-reminder":
      html = AttendanceReminderTemplate({
        athleteName: (data.athleteName as string) || "el atleta",
        className: (data.className as string) || "Clase",
        sessionDate: (data.sessionDate as string) || new Date().toLocaleDateString(),
        sessionTime: data.sessionTime as string | undefined,
        academyName: (data.academyName as string) || "Tu academia",
      });
      subject = `Recordatorio: Clase de ${data.className || "Clase"}`;
      break;

    case "payment-reminder":
      const amountValue = typeof data.amount === 'string'
        ? parseFloat(data.amount.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
        : typeof data.amount === 'number'
          ? data.amount
          : 0;
      html = PaymentReminderTemplate({
        athleteName: (data.athleteName as string) || "el atleta",
        amount: amountValue,
        dueDate: (data.dueDate as string) || new Date().toLocaleDateString(),
        academyName: (data.academyName as string) || "Tu academia",
        currency: (data.currency as string) || "EUR",
        paymentUrl: data.paymentLink as string | undefined,
      });
      subject = `Recordatorio de pago pendiente`;
      break;

    case "event-invitation":
      html = EventInvitationTemplate({
        eventName: (data.eventTitle as string) || (data.eventName as string) || "Evento",
        eventDate: (data.eventDate as string) || "Fecha por confirmar",
        eventTime: data.eventTime as string | undefined,
        eventLocation: data.eventLocation as string | undefined,
        academyName: (data.academyName as string) || "Tu academia",
        rsvpUrl: data.responseLink as string | undefined,
      });
      subject = `Invitación: ${data.eventTitle || "Evento"}`;
      break;

    case "class-cancellation":
      html = ClassCancellationTemplate({
        athleteName: (data.athleteName as string) || "el atleta",
        className: (data.className as string) || "Clase",
        sessionDate: (data.sessionDate as string) || new Date().toLocaleDateString(),
        sessionTime: data.sessionTime as string | undefined,
        academyName: (data.academyName as string) || "Tu academia",
        reason: data.reason as string | undefined,
      });
      subject = `Clase cancelada: ${data.className || "Clase"}`;
      break;

    default:
      return apiError("INVALID_TEMPLATE", "Invalid template", 400);
  }

  try {
    await sendEmailWithLogging({
      to,
      subject,
      html,
      template,
      tenantId: context.tenantId,
      academyId,
      userId: recipientProfileId,
      profileId: recipientProfileId,
      notificationType,
      metadata: data,
    });

    return apiSuccess({ ok: true });
  } catch (error: unknown) {
    logger.error("Error sending email:", error);
    return apiError("SEND_FAILED", "Error al enviar la notificación", 500);
  }
});
