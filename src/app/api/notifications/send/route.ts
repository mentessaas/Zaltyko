import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { AttendanceReminderTemplate } from "@/lib/email/templates/attendance-reminder";
import { PaymentReminderTemplate } from "@/lib/email/templates/payment-reminder";
import { EventInvitationTemplate } from "@/lib/email/templates/event-invitation";
import { ClassCancellationTemplate } from "@/lib/email/templates/class-cancellation";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const sendSchema = z.object({
  to: z.string().email(),
  template: z.enum(["attendance-reminder", "payment-reminder", "event-invitation", "class-cancellation"]),
  data: z.record(z.unknown()),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const body = sendSchema.parse(await request.json());
  const { to, template, data } = body;

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
      return NextResponse.json({ error: "INVALID_TEMPLATE" }, { status: 400 });
  }

  try {
    await sendEmailWithLogging({
      to,
      subject,
      html,
      template,
      tenantId: context.tenantId,
      academyId: data.academyId as string | undefined,
      userId: data.userId as string | undefined,
      metadata: data,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      { error: "SEND_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

