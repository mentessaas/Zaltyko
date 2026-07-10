import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { AttendanceReminderTemplate } from "@/lib/email/templates/attendance-reminder";
import { PaymentReminderTemplate } from "@/lib/email/templates/payment-reminder";
import { EventInvitationTemplate } from "@/lib/email/templates/event-invitation";
import { ClassCancellationTemplate } from "@/lib/email/templates/class-cancellation";
import { logger } from "@/lib/logger";
import { db } from "@/db";
import { academies, memberships } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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

  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.id, academyId), eq(academies.tenantId, context.tenantId)))
    .limit(1);
  if (!academy) {
    return apiError("FORBIDDEN", "La academia no pertenece al tenant activo", 403);
  }

  if (context.profile.role !== "super_admin") {
    const [membership] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.academyId, academyId), eq(memberships.userId, context.profile.userId)))
      .limit(1);
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return apiError("FORBIDDEN", "No tienes permiso para enviar correos de esta academia", 403);
    }
  }

  let html: string;
  let subject: string;

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
      userId: data.userId as string | undefined,
      metadata: data,
    });

    return apiSuccess({ ok: true });
  } catch (error: unknown) {
    logger.error("Error sending email:", error);
    return apiError("SEND_FAILED", "Error al enviar la notificación", 500);
  }
});
