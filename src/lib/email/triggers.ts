import { db } from "@/db";
import { athletes, guardians, familyContacts, classSessions, classes, charges, events } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { sendEmailWithLogging } from "./email-service";
import { AttendanceReminderTemplate } from "./templates/attendance-reminder";
import { PaymentReminderTemplate } from "./templates/payment-reminder";
import { EventInvitationTemplate } from "./templates/event-invitation";
import { ClassCancellationTemplate } from "./templates/class-cancellation";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Envía recordatorios de asistencia 24 horas antes de la clase
 */
export async function triggerAttendanceReminders(): Promise<number> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = format(tomorrow, "yyyy-MM-dd");

  // Obtener sesiones programadas para mañana
  const sessions = await db
    .select({
      sessionId: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      className: classes.name,
      academyId: classes.academyId,
      tenantId: classes.tenantId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classSessions.status, "scheduled"),
        eq(classSessions.sessionDate, tomorrowStr)
      )
    );

  let sentCount = 0;

  for (const session of sessions) {
    // Obtener atletas inscritos en la clase
    const enrolledAthletes = await db
      .select({
        athleteId: athletes.id,
        athleteName: athletes.name,
        guardianEmail: guardians.email,
        familyContactEmail: familyContacts.email,
      })
      .from(athletes)
      .leftJoin(guardians, eq(athletes.id, guardians.athleteId))
      .leftJoin(familyContacts, eq(athletes.id, familyContacts.athleteId))
      .where(eq(athletes.academyId, session.academyId));

    for (const athlete of enrolledAthletes) {
      const email = athlete.guardianEmail || athlete.familyContactEmail;
      if (!email) continue;

      try {
        const html = AttendanceReminderTemplate({
          athleteName: athlete.athleteName || "el atleta",
          className: session.className || "Clase",
          sessionDate: format(new Date(session.sessionDate), "PPP", { locale: es }),
          sessionTime: session.startTime || undefined,
          academyName: "Tu academia", // TODO: obtener nombre de academia
        });

        await sendEmailWithLogging({
          to: email,
          subject: `Recordatorio: Clase de ${session.className} mañana`,
          html,
          template: "attendance-reminder",
          tenantId: session.tenantId,
          academyId: session.academyId,
          metadata: {
            sessionId: session.sessionId,
            athleteId: athlete.athleteId,
          },
        });

        sentCount++;
      } catch (error) {
        console.error(`Error sending attendance reminder to ${email}:`, error);
      }
    }
  }

  return sentCount;
}

/**
 * Envía recordatorios de pagos pendientes
 */
export async function triggerPaymentReminders(): Promise<number> {
  const today = new Date();
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Obtener cargos vencidos o próximos a vencer
  const overdueCharges = await db
    .select({
      chargeId: charges.id,
      amount: charges.amount,
      dueDate: charges.dueDate,
      athleteId: charges.athleteId,
      academyId: charges.academyId,
      tenantId: charges.tenantId,
    })
    .from(charges)
    .where(
      and(
        eq(charges.status, "pending"),
        lte(charges.dueDate, today)
      )
    );

  let sentCount = 0;

  for (const charge of overdueCharges) {
    if (!charge.athleteId) continue;

    // Obtener información del atleta y guardianes
    const [athlete] = await db
      .select({
        athleteName: athletes.name,
        guardianEmail: guardians.email,
        familyContactEmail: familyContacts.email,
      })
      .from(athletes)
      .leftJoin(guardians, eq(athletes.id, guardians.athleteId))
      .leftJoin(familyContacts, eq(athletes.id, familyContacts.athleteId))
      .where(eq(athletes.id, charge.athleteId))
      .limit(1);

    if (!athlete) continue;

    const email = athlete.guardianEmail || athlete.familyContactEmail;
    if (!email) continue;

    try {
      const amount = typeof charge.amount === "string" 
        ? parseFloat(charge.amount).toFixed(2)
        : charge.amount?.toFixed(2) || "0.00";

      const html = PaymentReminderTemplate({
        athleteName: athlete.athleteName || "el atleta",
        amount: `${amount} €`,
        dueDate: format(new Date(charge.dueDate), "PPP", { locale: es }),
        academyName: "Tu academia", // TODO: obtener nombre de academia
      });

      await sendEmailWithLogging({
        to: email,
        subject: `Recordatorio de pago pendiente - ${amount} €`,
        html,
        template: "payment-reminder",
        tenantId: charge.tenantId,
        academyId: charge.academyId,
        metadata: {
          chargeId: charge.chargeId,
          athleteId: charge.athleteId,
        },
      });

      sentCount++;
    } catch (error) {
      console.error(`Error sending payment reminder to ${email}:`, error);
    }
  }

  return sentCount;
}

/**
 * Envía invitaciones a eventos
 */
export async function triggerEventInvitations(eventId: string): Promise<number> {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new Error("Event not found");
  }

  // Obtener atletas de la academia
  const academyAthletes = await db
    .select({
      athleteId: athletes.id,
      athleteName: athletes.name,
      guardianEmail: guardians.email,
      familyContactEmail: familyContacts.email,
    })
    .from(athletes)
    .leftJoin(guardians, eq(athletes.id, guardians.athleteId))
    .leftJoin(familyContacts, eq(athletes.id, familyContacts.athleteId))
    .where(eq(athletes.academyId, event.academyId));

  let sentCount = 0;

  for (const athlete of academyAthletes) {
    const email = athlete.guardianEmail || athlete.familyContactEmail;
    if (!email) continue;

    try {
      const html = EventInvitationTemplate({
        eventTitle: event.title,
        eventDate: event.date ? format(new Date(event.date), "PPP", { locale: es }) : "Fecha por confirmar",
        eventLocation: event.location || undefined,
        athleteName: athlete.athleteName || "el atleta",
        academyName: "Tu academia", // TODO: obtener nombre de academia
      });

      await sendEmailWithLogging({
        to: email,
        subject: `Invitación: ${event.title}`,
        html,
        template: "event-invitation",
        tenantId: event.tenantId,
        academyId: event.academyId,
        metadata: {
          eventId: event.id,
          athleteId: athlete.athleteId,
        },
      });

      sentCount++;
    } catch (error) {
      console.error(`Error sending event invitation to ${email}:`, error);
    }
  }

  return sentCount;
}

/**
 * Envía notificaciones de cancelación de clase
 */
export async function triggerClassCancellation(
  sessionId: string,
  reason?: string
): Promise<number> {
  const [session] = await db
    .select({
      sessionId: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      className: classes.name,
      academyId: classes.academyId,
      tenantId: classes.tenantId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(eq(classSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error("Session not found");
  }

  // Obtener atletas inscritos
  const enrolledAthletes = await db
    .select({
      athleteId: athletes.id,
      athleteName: athletes.name,
      guardianEmail: guardians.email,
      familyContactEmail: familyContacts.email,
    })
    .from(athletes)
    .leftJoin(guardians, eq(athletes.id, guardians.athleteId))
    .leftJoin(familyContacts, eq(athletes.id, familyContacts.athleteId))
    .where(eq(athletes.academyId, session.academyId));

  let sentCount = 0;

  for (const athlete of enrolledAthletes) {
    const email = athlete.guardianEmail || athlete.familyContactEmail;
    if (!email) continue;

    try {
      const html = ClassCancellationTemplate({
        athleteName: athlete.athleteName || "el atleta",
        className: session.className || "Clase",
        sessionDate: format(new Date(session.sessionDate), "PPP", { locale: es }),
        sessionTime: session.startTime || undefined,
        academyName: "Tu academia", // TODO: obtener nombre de academia
        reason,
      });

      await sendEmailWithLogging({
        to: email,
        subject: `Clase cancelada: ${session.className}`,
        html,
        template: "class-cancellation",
        tenantId: session.tenantId,
        academyId: session.academyId,
        metadata: {
          sessionId: session.sessionId,
          athleteId: athlete.athleteId,
          reason,
        },
      });

      sentCount++;
    } catch (error) {
      console.error(`Error sending cancellation notice to ${email}:`, error);
    }
  }

  return sentCount;
}

