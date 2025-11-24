import { db } from "@/db";
import { classSessions, classes, groupAthletes, groups, athletes } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { createNotification } from "@/lib/notifications/notification-service";
import { addHours, subHours } from "date-fns";
// import { sendAttendanceReminder } from "@/lib/email/triggers"; // TODO: Implementar función de envío de recordatorios

export interface ClassReminder {
  sessionId: string;
  className: string;
  sessionDate: Date;
  startTime: string | null;
  athleteIds: string[];
}

/**
 * Obtiene clases que necesitan recordatorios
 */
export async function getClassesNeedingReminders(
  academyId: string,
  tenantId: string,
  hoursBefore: number = 24
): Promise<ClassReminder[]> {
  const now = new Date();
  const reminderTime = addHours(now, hoursBefore);
  const reminderTimeStr = reminderTime.toISOString().split("T")[0];
  const reminderTimeEnd = addHours(reminderTime, 1);
  const reminderTimeEndStr = reminderTimeEnd.toISOString().split("T")[0];

  // Obtener sesiones en el rango de tiempo para recordatorios
  const sessions = await db
    .select({
      sessionId: classSessions.id,
      className: classes.name,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      groupId: classes.groupId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classes.academyId, academyId),
        eq(classes.tenantId, tenantId),
        gte(classSessions.sessionDate, reminderTimeStr),
        lte(classSessions.sessionDate, reminderTimeEndStr)
      )
    );

  const reminders: ClassReminder[] = [];

  for (const session of sessions) {
    let athleteIds: string[] = [];

    if (session.groupId) {
      // Obtener atletas del grupo
      const groupAthletesList = await db
        .select({ athleteId: groupAthletes.athleteId })
        .from(groupAthletes)
        .where(eq(groupAthletes.groupId, session.groupId));

      athleteIds = groupAthletesList.map((ga) => ga.athleteId);
    } else {
      // Si no hay grupo, obtener atletas de la clase (simplificado)
      // Esto requeriría una relación directa clase-atleta que puede no existir
    }

    reminders.push({
      sessionId: session.sessionId,
      className: session.className || "Clase",
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      athleteIds,
    });
  }

  return reminders;
}

/**
 * Envía recordatorios de clases
 */
export async function sendClassReminders(
  academyId: string,
  tenantId: string,
  hoursBefore: number = 24
) {
  const reminders = await getClassesNeedingReminders(academyId, tenantId, hoursBefore);

  for (const reminder of reminders) {
    // Obtener información de atletas
    const athletesList = await db
      .select({
        athleteId: athletes.id,
        athleteName: athletes.name,
      })
      .from(athletes)
      .where(eq(athletes.tenantId, tenantId));

    for (const athlete of athletesList) {
      if (reminder.athleteIds.includes(athlete.athleteId)) {
        // TODO: Enviar email de recordatorio
        // await sendAttendanceReminder({
        //   athleteId: athlete.athleteId,
        //   sessionId: reminder.sessionId,
        //   academyId,
        // });

        // Crear notificación in-app
        // TODO: Obtener userId del atleta/padre
        // await createNotification({...});
      }
    }
  }
}

