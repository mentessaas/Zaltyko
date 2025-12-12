import { db } from "@/db";
import { athletes, guardians, guardianAthletes, familyContacts, classSessions, classes, charges, events, academies } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { sendEmailWithLogging } from "./email-service";
import { AttendanceReminderTemplate } from "./templates/attendance-reminder";
import { PaymentReminderTemplate } from "./templates/payment-reminder";
import { EventInvitationTemplate } from "./templates/event-invitation";
import { ClassCancellationTemplate } from "./templates/class-cancellation";
import { formatLongDateForCountry } from "@/lib/date-utils";

/**
 * Envía recordatorios de asistencia 24 horas antes de la clase
 */
export async function triggerAttendanceReminders(): Promise<number> {
  // Usar fecha actual en UTC para comparaciones (las fechas en BD están en formato ISO)
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Obtener sesiones programadas para mañana
  const sessions = await db
    .select({
      sessionId: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      className: classes.name,
      academyId: classes.academyId,
      academyCountry: academies.country,
      tenantId: classes.tenantId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(academies, eq(classes.academyId, academies.id))
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
      .leftJoin(guardianAthletes, eq(athletes.id, guardianAthletes.athleteId))
      .leftJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
      .leftJoin(familyContacts, eq(athletes.id, familyContacts.athleteId))
      .where(eq(athletes.academyId, session.academyId));

    for (const athlete of enrolledAthletes) {
      const email = athlete.guardianEmail || athlete.familyContactEmail;
      if (!email) continue;

      try {
        const html = AttendanceReminderTemplate({
          athleteName: athlete.athleteName || "el atleta",
          className: session.className || "Clase",
          sessionDate: formatLongDateForCountry(session.sessionDate, session.academyCountry),
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
  const todayStr = today.toISOString().split("T")[0];
  const overdueCharges = await db
    .select({
      chargeId: charges.id,
      amountCents: charges.amountCents,
      dueDate: charges.dueDate,
      athleteId: charges.athleteId,
      academyId: charges.academyId,
      academyCountry: academies.country,
      tenantId: charges.tenantId,
    })
    .from(charges)
    .innerJoin(academies, eq(charges.academyId, academies.id))
    .where(
      and(
        eq(charges.status, "pending"),
        lte(charges.dueDate, todayStr)
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
      .leftJoin(guardianAthletes, eq(athletes.id, guardianAthletes.athleteId))
      .leftJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
      .leftJoin(familyContacts, eq(athletes.id, familyContacts.athleteId))
      .where(eq(athletes.id, charge.athleteId))
      .limit(1);

    if (!athlete) continue;

    const email = athlete.guardianEmail || athlete.familyContactEmail;
    if (!email) continue;

    try {
      const amount = charge.amountCents / 100;

      const html = PaymentReminderTemplate({
        athleteName: athlete.athleteName || "el atleta",
        amount: amount,
        dueDate: charge.dueDate ? formatLongDateForCountry(charge.dueDate, charge.academyCountry) : "Fecha no especificada",
        academyName: "Tu academia", // TODO: obtener nombre de academia
      });

      await sendEmailWithLogging({
        to: email,
        subject: `Recordatorio de pago pendiente - ${amount.toFixed(2)} €`,
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
    .select({
      id: events.id,
      title: events.title,
      startDate: events.startDate,
      endDate: events.endDate,
      country: events.country,
      province: events.province,
      city: events.city,
      isPublic: events.isPublic,
      academyId: events.academyId,
      tenantId: events.tenantId,
      academyCountry: academies.country,
    })
    .from(events)
    .innerJoin(academies, eq(events.academyId, academies.id))
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
    .leftJoin(guardianAthletes, eq(athletes.id, guardianAthletes.athleteId))
    .leftJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .leftJoin(familyContacts, eq(athletes.id, familyContacts.athleteId))
    .where(eq(athletes.academyId, event.academyId));

  let sentCount = 0;

  for (const athlete of academyAthletes) {
    const email = athlete.guardianEmail || athlete.familyContactEmail;
    if (!email) continue;

    try {
      const location = [event.city, event.province, event.country].filter(Boolean).join(", ") || undefined;
      const dateText = event.startDate 
        ? event.endDate && event.endDate !== event.startDate
          ? `${formatLongDateForCountry(String(event.startDate), event.academyCountry)} - ${formatLongDateForCountry(String(event.endDate), event.academyCountry)}`
          : formatLongDateForCountry(String(event.startDate), event.academyCountry)
        : "Fecha por confirmar";

      const html = EventInvitationTemplate({
        eventName: event.title,
        eventDate: dateText,
        eventLocation: location,
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
      academyCountry: academies.country,
      tenantId: classes.tenantId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(academies, eq(classes.academyId, academies.id))
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
    .leftJoin(guardianAthletes, eq(athletes.id, guardianAthletes.athleteId))
    .leftJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
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
        sessionDate: formatLongDateForCountry(session.sessionDate, session.academyCountry),
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

