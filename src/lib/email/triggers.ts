import { db } from "@/db";
import {
  athletes,
  guardians,
  guardianAthletes,
  familyContacts,
  classSessions,
  classes,
  charges,
  events,
  academies,
  classEnrollments,
  groupAthletes,
  classGroups,
  groups,
} from "@/db/schema";
import { eq, and, gte, lt, lte, inArray, isNull, or } from "drizzle-orm";
import { sendEmailWithLogging } from "./email-service";
import { AttendanceReminderTemplate } from "./templates/attendance-reminder";
import { PaymentReminderTemplate } from "./templates/payment-reminder";
import { EventInvitationTemplate } from "./templates/event-invitation";
import { ClassCancellationTemplate } from "./templates/class-cancellation";
import { formatLongDateForCountry } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { getCurrencyForCountry } from "@/lib/currency";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";
import type { ClassReminderTiming } from "@/lib/notifications/preferences";

/**
 * Envía recordatorios de asistencia 24 horas antes de la clase
 */
export async function triggerAttendanceReminders(scope?: {
  academyId?: string;
  tenantId?: string;
  /** Number of hours from now to target; defaults to the normal 24-hour reminder. */
  hoursBefore?: number;
}): Promise<number> {
  // Usar fecha actual en UTC para comparaciones (las fechas en BD están en formato ISO).
  // Mantener el offset configurable permite que el endpoint manual respete
  // `hoursBefore` sin alterar el cron estándar de 24 horas.
  const hoursBefore = Number.isFinite(scope?.hoursBefore)
    ? Math.max(0, Math.min(scope?.hoursBefore ?? 24, 168))
    : 24;
  const target = new Date(Date.now() + hoursBefore * 60 * 60 * 1000);
  const targetDateStr = target.toISOString().split("T")[0];

  // Obtener sesiones programadas para el día objetivo. Las clases borradas no
  // deben generar comunicaciones, aunque aún exista una sesión histórica.
  const sessionConditions = [
    eq(classSessions.status, "scheduled"),
    eq(classSessions.sessionDate, targetDateStr),
    ...(scope?.academyId ? [eq(classes.academyId, scope.academyId)] : []),
    ...(scope?.tenantId ? [eq(classes.tenantId, scope.tenantId)] : []),
    eq(classSessions.tenantId, classes.tenantId),
    isNull(classes.deletedAt),
  ];
  const sessions = await db
    .select({
      sessionId: classSessions.id,
      classId: classSessions.classId,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      className: classes.name,
      academyId: classes.academyId,
      academyName: academies.name,
      academyCountry: academies.country,
      tenantId: classes.tenantId,
      groupId: classes.groupId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(academies, eq(classes.academyId, academies.id))
    .where(and(...sessionConditions))
    .limit(5000);

  // Una clase puede recibir atletas por su grupo principal, por asignaciones
  // multi-grupo o por una matrícula extra. Resolver las tres fuentes en
  // bloque evita que los recordatorios de las clases normales lleguen a cero
  // y elimina una consulta por sesión.
  const classIds = Array.from(new Set(sessions.map((session) => session.classId)));
  const tenantByClassId = new Map(
    sessions.map((session) => [session.classId, session.tenantId] as const)
  );
  const classGroupRows = classIds.length
    ? await db
        .select({
          classId: classGroups.classId,
          groupId: classGroups.groupId,
          tenantId: classGroups.tenantId,
        })
        .from(classGroups)
        .where(inArray(classGroups.classId, classIds))
        .limit(5000)
    : [];
  const groupsByClass = new Map<string, Set<string>>();
  for (const session of sessions) {
    groupsByClass.set(session.classId, new Set(session.groupId ? [session.groupId] : []));
  }
  for (const row of classGroupRows) {
    if (tenantByClassId.get(row.classId) !== row.tenantId) continue;
    const classGroupsForClass = groupsByClass.get(row.classId) ?? new Set<string>();
    classGroupsForClass.add(row.groupId);
    groupsByClass.set(row.classId, classGroupsForClass);
  }

  const groupIds = Array.from(
    new Set(Array.from(groupsByClass.values()).flatMap((ids) => Array.from(ids)))
  );
  const athletesByGroup = new Map<string, Set<string>>();
  const tenantByGroupId = new Map<string, string>();
  if (groupIds.length > 0) {
    const [membershipRows, legacyRows] = await Promise.all([
      db
        .select({
          groupId: groupAthletes.groupId,
          athleteId: groupAthletes.athleteId,
          tenantId: groups.tenantId,
        })
        .from(groupAthletes)
        .innerJoin(athletes, eq(groupAthletes.athleteId, athletes.id))
        .innerJoin(groups, eq(groupAthletes.groupId, groups.id))
        .where(
          and(
            inArray(groupAthletes.groupId, groupIds),
            eq(groupAthletes.tenantId, groups.tenantId),
            eq(athletes.tenantId, groups.tenantId),
            eq(athletes.academyId, groups.academyId),
            isNull(athletes.deletedAt),
            eq(athletes.status, "active"),
            isNull(groups.deletedAt)
          )
        )
        .limit(10000),
      db
        .select({ groupId: athletes.groupId, athleteId: athletes.id, tenantId: groups.tenantId })
        .from(athletes)
        .innerJoin(groups, eq(athletes.groupId, groups.id))
        .where(
          and(
            inArray(athletes.groupId, groupIds),
            eq(athletes.tenantId, groups.tenantId),
            eq(athletes.academyId, groups.academyId),
            isNull(athletes.deletedAt),
            eq(athletes.status, "active"),
            isNull(groups.deletedAt)
          )
        )
        .limit(10000),
    ]);

    for (const row of [...membershipRows, ...legacyRows]) {
      if (!row.groupId) continue;
      tenantByGroupId.set(row.groupId, row.tenantId);
      const athleteIds = athletesByGroup.get(row.groupId) ?? new Set<string>();
      athleteIds.add(row.athleteId);
      athletesByGroup.set(row.groupId, athleteIds);
    }
  }

  const athleteIdsBySession = new Map<string, Set<string>>();
  for (const session of sessions) {
    const athleteIds = new Set<string>();
    for (const groupId of groupsByClass.get(session.classId) ?? []) {
      if (tenantByGroupId.get(groupId) !== session.tenantId) continue;
      for (const athleteId of athletesByGroup.get(groupId) ?? []) athleteIds.add(athleteId);
    }
    athleteIdsBySession.set(session.sessionId, athleteIds);
  }

  const enrollmentRows = classIds.length
    ? await db
        .select({
          classId: classEnrollments.classId,
          athleteId: classEnrollments.athleteId,
          tenantId: classEnrollments.tenantId,
        })
        .from(classEnrollments)
        .innerJoin(athletes, eq(classEnrollments.athleteId, athletes.id))
        .where(
          and(
            inArray(classEnrollments.classId, classIds),
            eq(classEnrollments.tenantId, athletes.tenantId),
            eq(classEnrollments.academyId, athletes.academyId),
            isNull(athletes.deletedAt),
            eq(athletes.status, "active")
          )
        )
        .limit(10000)
    : [];
  const sessionIdsByClassId = new Map<string, string[]>();
  for (const session of sessions) {
    const ids = sessionIdsByClassId.get(session.classId) ?? [];
    ids.push(session.sessionId);
    sessionIdsByClassId.set(session.classId, ids);
  }
  for (const row of enrollmentRows) {
    if (tenantByClassId.get(row.classId) !== row.tenantId) continue;
    for (const sessionId of sessionIdsByClassId.get(row.classId) ?? []) {
      athleteIdsBySession.get(sessionId)?.add(row.athleteId);
    }
  }

  const allAthleteIds = Array.from(
    new Set(Array.from(athleteIdsBySession.values()).flatMap((ids) => Array.from(ids)))
  );
  const contactRows = allAthleteIds.length
    ? await db
        .select({
          athleteId: athletes.id,
          athleteName: athletes.name,
          guardianEmail: guardians.email,
          guardianProfileId: guardians.profileId,
          familyContactEmail: familyContacts.email,
        })
        .from(athletes)
        .leftJoin(
          guardianAthletes,
          and(
            eq(athletes.id, guardianAthletes.athleteId),
            eq(athletes.tenantId, guardianAthletes.tenantId)
          )
        )
        .leftJoin(
          guardians,
          and(
            eq(guardianAthletes.guardianId, guardians.id),
            eq(athletes.tenantId, guardians.tenantId)
          )
        )
        .leftJoin(
          familyContacts,
          and(
            eq(athletes.id, familyContacts.athleteId),
            eq(athletes.tenantId, familyContacts.tenantId),
            or(isNull(familyContacts.notifyEmail), eq(familyContacts.notifyEmail, true))
          )
        )
        .where(
          and(
            inArray(athletes.id, allAthleteIds),
            isNull(athletes.deletedAt),
            eq(athletes.status, "active")
          )
        )
        .limit(20000)
    : [];
  const contactsByAthlete = new Map<string, { athleteName: string | null; email: string; profileId: string | null }>();
  for (const row of contactRows) {
    const email = row.guardianEmail?.trim() || row.familyContactEmail?.trim();
    if (email && !contactsByAthlete.has(row.athleteId)) {
      contactsByAthlete.set(row.athleteId, {
        athleteName: row.athleteName,
        email,
        profileId: row.guardianEmail?.trim() ? row.guardianProfileId : null,
      });
    }
  }

  const classReminderTiming: ClassReminderTiming = hoursBefore <= 2 ? "1h" : "24h";

  let sentCount = 0;
  for (const session of sessions) {
    const className = session.className || "Clase";
    for (const athleteId of athleteIdsBySession.get(session.sessionId) ?? []) {
      const athlete = contactsByAthlete.get(athleteId);
      if (!athlete) continue;

      try {
        const html = AttendanceReminderTemplate({
          athleteName: athlete.athleteName || "el atleta",
          className,
          sessionDate: formatLongDateForCountry(
            session.sessionDate,
            session.academyCountry
          ),
          sessionTime: session.startTime || undefined,
          academyName: session.academyName || "Tu academia",
        });

        const delivered = await sendEmailWithLogging({
          to: athlete.email,
          subject: `Recordatorio: Clase de ${className} mañana`,
          html,
          template: "attendance-reminder",
          tenantId: session.tenantId,
          academyId: session.academyId,
          profileId: athlete.profileId ?? undefined,
          notificationType: "class_reminder",
          classReminderTiming,
          dedupeKey: `attendance-reminder:${session.sessionId}:${athleteId}`,
          metadata: {
            sessionId: session.sessionId,
            athleteId,
          },
        });

        if (delivered) sentCount++;
      } catch (error) {
        logger.error(`Error sending attendance reminder to ${athlete.email}:`, error);
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
  // Obtener cargos vencidos o próximos a vencer
  const todayStr = today.toISOString().split("T")[0];
  const overdueCharges = await db
    .select({
      chargeId: charges.id,
      amountCents: charges.amountCents,
      dueDate: charges.dueDate,
      athleteId: charges.athleteId,
      academyId: charges.academyId,
      academyName: academies.name,
      academyCountry: academies.country,
      currency: charges.currency,
      tenantId: charges.tenantId,
    })
    .from(charges)
    .innerJoin(academies, eq(charges.academyId, academies.id))
    .where(
      and(
        eq(charges.status, "pending"),
        lte(charges.dueDate, todayStr),
        eq(charges.tenantId, academies.tenantId)
      )
    )
    .limit(10000);

  let sentCount = 0;

  for (const charge of overdueCharges) {
    if (!charge.athleteId) continue;

    // Obtener información del atleta y guardianes
    const [athlete] = await db
      .select({
        athleteName: athletes.name,
        guardianEmail: guardians.email,
        guardianProfileId: guardians.profileId,
        familyContactEmail: familyContacts.email,
      })
      .from(athletes)
      .leftJoin(
        guardianAthletes,
        and(
          eq(athletes.id, guardianAthletes.athleteId),
          eq(guardianAthletes.tenantId, charge.tenantId)
        )
      )
      .leftJoin(
        guardians,
        and(
          eq(guardianAthletes.guardianId, guardians.id),
          eq(guardians.tenantId, charge.tenantId)
        )
      )
      .leftJoin(
        familyContacts,
        and(
          eq(athletes.id, familyContacts.athleteId),
          eq(familyContacts.tenantId, charge.tenantId),
          or(isNull(familyContacts.notifyEmail), eq(familyContacts.notifyEmail, true))
        )
      )
      .where(
        and(
          eq(athletes.id, charge.athleteId),
          eq(athletes.tenantId, charge.tenantId),
          eq(athletes.academyId, charge.academyId),
          eq(athletes.status, "active"),
          isNull(athletes.deletedAt)
        )
      )
      .limit(1);

    if (!athlete) continue;

    const email = athlete.guardianEmail || athlete.familyContactEmail;
    if (!email) continue;

    try {
      const amount = charge.amountCents / 100;

      const html = PaymentReminderTemplate({
        athleteName: athlete.athleteName || "el atleta",
        amount: amount,
        dueDate: charge.dueDate
          ? formatLongDateForCountry(charge.dueDate, charge.academyCountry)
          : "Fecha no especificada",
        academyName: charge.academyName || "Tu academia",
        currency: charge.currency ?? getCurrencyForCountry(charge.academyCountry),
      });

      const delivered = await sendEmailWithLogging({
        to: email,
        subject: `Recordatorio de pago pendiente - ${amount.toFixed(2)} ${(charge.currency ?? getCurrencyForCountry(charge.academyCountry)).toUpperCase()}`,
        html,
        template: "payment-reminder",
        tenantId: charge.tenantId,
        academyId: charge.academyId,
        profileId: athlete.guardianProfileId ?? undefined,
        notificationType: "invoice_pending",
        metadata: {
          chargeId: charge.chargeId,
          athleteId: charge.athleteId,
        },
        dedupeKey: `payment-reminder:${charge.chargeId}:legacy-overdue`,
      });

      if (delivered) sentCount++;
    } catch (error) {
      logger.error(`Error sending payment reminder to ${email}:`, error);
    }
  }

  return sentCount;
}

/**
 * Recordatorios de pago programados en 4 ventanas relativas al vencimiento:
 *  -3 dias (proximo), dia de vencimiento, +3 y +7 dias (vencido).
 * Pensado para ejecutarse UNA vez al dia desde el cron. Cada offset cubre la
 * ventana [hoy-offset, hoy]: la dedupe permanente por cargo+offset evita
 * duplicados y una ejecucion fallida se recupera al dia siguiente.
 */
const REMINDER_OFFSETS_DAYS = [-3, 0, 3, 7] as const;

function toDateOnly(date: Date): string {
  return date.toISOString().split("T")[0];
}

export async function triggerScheduledPaymentReminders(
  now: Date = new Date()
): Promise<number> {
  let sentCount = 0;

  for (const offset of REMINDER_OFFSETS_DAYS) {
    // Ventana [hoy-offset, hoy-offset+1): el recordatorio corresponde a cargos
    // cuyo vencimiento cae en esa fecha. Con rango (no fecha exacta), si el
    // cron falla un día el recordatorio se recupera en la siguiente ejecución
    // (la dedupe por charge+offset evita duplicados dentro de la misma ventana).
    const target = new Date(now);
    target.setDate(target.getDate() - offset);
    const targetStr = toDateOnly(target);
    // Ventana hasta hoy: si una ejecución diaria falló, los cargos vencidos en
    // días previos se recuperan aquí. La dedupe permanente por
    // charge+offset impide duplicados en re-ejecuciones.
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + 1);
    const windowEndStr = toDateOnly(windowEnd);

    const dueCharges = await db
      .select({
        chargeId: charges.id,
        amountCents: charges.amountCents,
        dueDate: charges.dueDate,
        athleteId: charges.athleteId,
        academyId: charges.academyId,
        academyName: academies.name,
        academyCountry: academies.country,
        currency: charges.currency,
        tenantId: charges.tenantId,
      })
      .from(charges)
      .innerJoin(academies, eq(charges.academyId, academies.id))
      .where(
        and(
          inArray(charges.status, ["pending", "overdue", "failed"]),
          gte(charges.dueDate, targetStr),
          lt(charges.dueDate, windowEndStr),
          eq(charges.tenantId, academies.tenantId)
        )
      )
      .limit(10000);

    for (const charge of dueCharges) {
      if (!charge.athleteId) continue;

      const [athlete] = await db
        .select({
          athleteName: athletes.name,
          guardianEmail: guardians.email,
          guardianProfileId: guardians.profileId,
          familyContactEmail: familyContacts.email,
        })
        .from(athletes)
        .leftJoin(
          guardianAthletes,
          and(
            eq(athletes.id, guardianAthletes.athleteId),
            eq(guardianAthletes.tenantId, charge.tenantId)
          )
        )
        .leftJoin(
          guardians,
          and(
            eq(guardianAthletes.guardianId, guardians.id),
            eq(guardians.tenantId, charge.tenantId)
          )
        )
        .leftJoin(
          familyContacts,
          and(
            eq(athletes.id, familyContacts.athleteId),
            eq(familyContacts.tenantId, charge.tenantId),
            or(isNull(familyContacts.notifyEmail), eq(familyContacts.notifyEmail, true))
          )
        )
        .where(
          and(
            eq(athletes.id, charge.athleteId),
            eq(athletes.tenantId, charge.tenantId),
            eq(athletes.academyId, charge.academyId),
            eq(athletes.status, "active"),
            isNull(athletes.deletedAt)
          )
        )
        .limit(1);

      const email = athlete?.guardianEmail || athlete?.familyContactEmail;
      if (!email) continue;

      const amount = charge.amountCents / 100;
      const subject =
        offset < 0
          ? `Tu cuota vence pronto - ${amount.toFixed(2)} ${(charge.currency ?? getCurrencyForCountry(charge.academyCountry)).toUpperCase()}`
          : offset === 0
            ? `Tu cuota vence hoy - ${amount.toFixed(2)} ${(charge.currency ?? getCurrencyForCountry(charge.academyCountry)).toUpperCase()}`
            : `Cuota pendiente - ${amount.toFixed(2)} ${(charge.currency ?? getCurrencyForCountry(charge.academyCountry)).toUpperCase()}`;

      try {
        const html = PaymentReminderTemplate({
          athleteName: athlete?.athleteName || "el atleta",
          amount,
          dueDate: charge.dueDate
            ? formatLongDateForCountry(charge.dueDate, charge.academyCountry)
            : "Fecha no especificada",
          academyName: charge.academyName || "Tu academia",
          currency: charge.currency ?? getCurrencyForCountry(charge.academyCountry),
        });

        const delivered = await sendEmailWithLogging({
          to: email,
          subject,
          html,
          template: "payment-reminder",
          tenantId: charge.tenantId,
          academyId: charge.academyId,
          profileId: athlete?.guardianProfileId ?? undefined,
          notificationType: "invoice_pending",
          metadata: {
            chargeId: charge.chargeId,
            athleteId: charge.athleteId,
            reminderOffset: offset,
          },
          dedupeKey: `payment-reminder:${charge.chargeId}:${offset}`,
        });
        if (delivered) sentCount++;
      } catch (error) {
        logger.error(
          `Error sending scheduled payment reminder to ${email}:`,
          error
        );
      }
    }
  }

  return sentCount;
}

export type ManualPaymentReminderResult =
  | { ok: true; sentTo: string }
  | {
      ok: false;
      reason:
        | "CHARGE_NOT_FOUND"
        | "CHARGE_ALREADY_SETTLED"
        | "NO_CONTACT_EMAIL"
        | "EMAIL_PREFERENCE_DISABLED";
    };

/**
 * Envía el recordatorio de un único cargo, a petición manual de la academia
 * (botón "Enviar recordatorio" en Cobros). A diferencia de triggerPaymentReminders,
 * no barre todos los cargos vencidos: apunta a un chargeId concreto y valida
 * que pertenezca al tenant que lo solicita.
 */
export async function sendManualPaymentReminder({
  chargeId,
  tenantId,
}: {
  chargeId: string;
  tenantId: string;
}): Promise<ManualPaymentReminderResult> {
  const [charge] = await db
    .select({
      chargeId: charges.id,
      amountCents: charges.amountCents,
      dueDate: charges.dueDate,
      status: charges.status,
      athleteId: charges.athleteId,
      academyId: charges.academyId,
      academyName: academies.name,
      academyCountry: academies.country,
      currency: charges.currency,
      tenantId: charges.tenantId,
    })
    .from(charges)
    .innerJoin(academies, eq(charges.academyId, academies.id))
    .where(
      and(
        eq(charges.id, chargeId),
        eq(charges.tenantId, tenantId),
        eq(charges.tenantId, academies.tenantId)
      )
    )
    .limit(1);

  if (!charge) {
    return { ok: false, reason: "CHARGE_NOT_FOUND" };
  }

  if (charge.status !== "pending" && charge.status !== "overdue") {
    return { ok: false, reason: "CHARGE_ALREADY_SETTLED" };
  }

  if (!charge.athleteId) {
    return { ok: false, reason: "CHARGE_NOT_FOUND" };
  }

  const [athlete] = await db
    .select({
      athleteName: athletes.name,
      guardianEmail: guardians.email,
      guardianProfileId: guardians.profileId,
      familyContactEmail: familyContacts.email,
    })
    .from(athletes)
    .leftJoin(
      guardianAthletes,
      and(
        eq(athletes.id, guardianAthletes.athleteId),
        eq(guardianAthletes.tenantId, charge.tenantId)
      )
    )
    .leftJoin(
      guardians,
      and(
        eq(guardianAthletes.guardianId, guardians.id),
        eq(guardians.tenantId, charge.tenantId)
      )
    )
    .leftJoin(
      familyContacts,
      and(
        eq(athletes.id, familyContacts.athleteId),
        eq(familyContacts.tenantId, charge.tenantId),
        or(isNull(familyContacts.notifyEmail), eq(familyContacts.notifyEmail, true))
      )
    )
    .where(
      and(
        eq(athletes.id, charge.athleteId),
        eq(athletes.tenantId, charge.tenantId),
        eq(athletes.academyId, charge.academyId),
        eq(athletes.status, "active"),
        isNull(athletes.deletedAt)
      )
    )
    .limit(1);

  const email = athlete?.guardianEmail || athlete?.familyContactEmail;
  if (!email) {
    return { ok: false, reason: "NO_CONTACT_EMAIL" };
  }

  const amount = charge.amountCents / 100;

  const html = PaymentReminderTemplate({
    athleteName: athlete?.athleteName || "el atleta",
    amount,
    dueDate: charge.dueDate
      ? formatLongDateForCountry(charge.dueDate, charge.academyCountry)
      : "Fecha no especificada",
    academyName: charge.academyName || "Tu academia",
    currency: charge.currency ?? getCurrencyForCountry(charge.academyCountry),
  });

  const delivered = await sendEmailWithLogging({
    to: email,
    subject: `Recordatorio de pago pendiente - ${amount.toFixed(2)} ${(charge.currency ?? getCurrencyForCountry(charge.academyCountry)).toUpperCase()}`,
    html,
    template: "payment-reminder",
    tenantId,
    academyId: charge.academyId,
    profileId: athlete.guardianProfileId ?? undefined,
    notificationType: "invoice_pending",
    metadata: {
      chargeId: charge.chargeId,
      athleteId: charge.athleteId,
      manual: true,
    },
  });

  if (!delivered) {
    return { ok: false, reason: "EMAIL_PREFERENCE_DISABLED" };
  }

  return { ok: true, sentTo: email };
}

/**
 * Envía invitaciones a eventos
 */
export async function triggerEventInvitations(
  eventId: string
): Promise<number> {
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
      academyName: academies.name,
      academyCountry: academies.country,
    })
    .from(events)
    .innerJoin(academies, eq(events.academyId, academies.id))
    .where(and(eq(events.id, eventId), eq(events.tenantId, academies.tenantId)))
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
      guardianProfileId: guardians.profileId,
      familyContactEmail: familyContacts.email,
    })
    .from(athletes)
    .leftJoin(
      guardianAthletes,
      and(
        eq(athletes.id, guardianAthletes.athleteId),
        eq(guardianAthletes.tenantId, event.tenantId)
      )
    )
    .leftJoin(
      guardians,
      and(
        eq(guardianAthletes.guardianId, guardians.id),
        eq(guardians.tenantId, event.tenantId)
      )
    )
    .leftJoin(
      familyContacts,
      and(
        eq(athletes.id, familyContacts.athleteId),
        eq(familyContacts.tenantId, event.tenantId),
        or(isNull(familyContacts.notifyEmail), eq(familyContacts.notifyEmail, true))
      )
    )
    .where(
      and(
        eq(athletes.academyId, event.academyId),
        eq(athletes.tenantId, event.tenantId),
        eq(athletes.status, "active"),
        isNull(athletes.deletedAt)
      )
    )
    .limit(10000);

  let sentCount = 0;

  for (const athlete of academyAthletes) {
    const email = athlete.guardianEmail || athlete.familyContactEmail;
    if (!email) continue;

    try {
      const location =
        [event.city, event.province, event.country]
          .filter(Boolean)
          .join(", ") || undefined;
      const dateText = event.startDate
        ? event.endDate && event.endDate !== event.startDate
          ? `${formatLongDateForCountry(String(event.startDate), event.academyCountry)} - ${formatLongDateForCountry(String(event.endDate), event.academyCountry)}`
          : formatLongDateForCountry(
              String(event.startDate),
              event.academyCountry
            )
        : "Fecha por confirmar";

      const html = EventInvitationTemplate({
        eventName: event.title,
        eventDate: dateText,
        eventLocation: location,
        academyName: event.academyName || "Tu academia",
      });

      const delivered = await sendEmailWithLogging({
        to: email,
        subject: `Invitación: ${event.title}`,
        html,
        template: "event-invitation",
        tenantId: event.tenantId,
        academyId: event.academyId,
        profileId: athlete.guardianProfileId ?? undefined,
        notificationType: "event",
        metadata: {
          eventId: event.id,
          athleteId: athlete.athleteId,
        },
      });

      if (delivered) sentCount++;
    } catch (error) {
      logger.error(`Error sending event invitation to ${email}:`, error);
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
      classId: classSessions.classId,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      className: classes.name,
      academyId: classes.academyId,
      academyName: academies.name,
      academyCountry: academies.country,
      tenantId: classes.tenantId,
      groupId: classes.groupId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(academies, eq(classes.academyId, academies.id))
    .where(
      and(
        eq(classSessions.id, sessionId),
        eq(classSessions.tenantId, classes.tenantId),
        isNull(classes.deletedAt),
        eq(classes.tenantId, academies.tenantId)
      )
    )
    .limit(1);

  if (!session) {
    throw new Error("Session not found");
  }

  // Reutilizar el resolvedor canónico de clase combina grupo principal,
  // asignaciones multi-grupo y matrículas extra, sin avisar a toda la
  // academia ni omitir clases que usan class_groups.
  const athleteIds = (await getClassAthletes(session.classId, session.academyId)).map(
    (athlete) => athlete.id
  );
  if (athleteIds.length === 0) return 0;

  const enrolledAthletes = await db
    .select({
      athleteId: athletes.id,
      athleteName: athletes.name,
      guardianEmail: guardians.email,
      guardianProfileId: guardians.profileId,
      familyContactEmail: familyContacts.email,
    })
    .from(athletes)
    .leftJoin(
      guardianAthletes,
      and(
        eq(athletes.id, guardianAthletes.athleteId),
        eq(guardianAthletes.tenantId, session.tenantId)
      )
    )
    .leftJoin(
      guardians,
      and(
        eq(guardianAthletes.guardianId, guardians.id),
        eq(guardians.tenantId, session.tenantId)
      )
    )
    .leftJoin(
      familyContacts,
      and(
        eq(athletes.id, familyContacts.athleteId),
        eq(familyContacts.tenantId, session.tenantId),
        or(isNull(familyContacts.notifyEmail), eq(familyContacts.notifyEmail, true))
      )
    )
    .where(
      and(
        inArray(athletes.id, athleteIds),
        eq(athletes.academyId, session.academyId),
        eq(athletes.tenantId, session.tenantId),
        eq(athletes.status, "active"),
        isNull(athletes.deletedAt)
      )
    )
    .limit(10000);

  let sentCount = 0;

  for (const athlete of enrolledAthletes) {
    const email = athlete.guardianEmail || athlete.familyContactEmail;
    if (!email) continue;

    try {
      const html = ClassCancellationTemplate({
        athleteName: athlete.athleteName || "el atleta",
        className: session.className || "Clase",
        sessionDate: formatLongDateForCountry(
          session.sessionDate,
          session.academyCountry
        ),
        sessionTime: session.startTime || undefined,
        academyName: session.academyName || "Tu academia",
        reason,
      });

      const delivered = await sendEmailWithLogging({
        to: email,
        subject: `Clase cancelada: ${session.className}`,
        html,
        template: "class-cancellation",
        tenantId: session.tenantId,
        academyId: session.academyId,
        profileId: athlete.guardianProfileId ?? undefined,
        notificationType: "schedule_change",
        metadata: {
          sessionId: session.sessionId,
          athleteId: athlete.athleteId,
          reason,
        },
      });

      if (delivered) sentCount++;
    } catch (error) {
      logger.error(`Error sending cancellation notice to ${email}:`, error);
    }
  }

  return sentCount;
}
