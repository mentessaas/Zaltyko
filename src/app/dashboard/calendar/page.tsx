import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { addDays } from "date-fns";
import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, Shield, Calendar, CalendarDays } from "lucide-react";

import { db } from "@/db";
import {
  academies,
  athletes,
  classEnrollments,
  classGroups,
  classSessions,
  classes,
  classWeekdays,
  coaches,
  guardianAthletes,
  guardians,
  memberships,
  profiles,
} from "@/db/schema";
import CalendarView from "@/components/calendar/CalendarView";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { formatDateToISOString, getWeekBoundariesInCountryTimezone, getMonthBoundariesInCountryTimezone, getFirstDateForWeekdayInTimezone } from "@/lib/date-utils";
import { PageHeader } from "@/components/ui/page-header";

interface CalendarPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type CalendarSessionEntry = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  classId: string | null;
  className: string | null;
  academyName: string | null;
  coachName: string | null;
  targetUrl?: string;
  isPlaceholder?: boolean;
};

function parseDateParam(value?: string): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function toISODate(date: Date, countryCode?: string | null) {
  // Usar la función que respeta la zona horaria del país
  return formatDateToISOString(date, countryCode);
}

// Función eliminada - ahora usamos getFirstDateForWeekdayInTimezone de date-utils

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  let currentProfile;
  try {
    currentProfile = await getCurrentProfile(user.id);
  } catch (error) {
    console.error("Error getting profile:", error);
    redirect("/onboarding/owner");
  }
  if (!currentProfile) {
    redirect("/dashboard");
  }

  // Si hay un profileId en los searchParams y el usuario es Super Admin, usar ese perfil
  const profileIdParam = typeof params.profileId === "string" ? params.profileId : undefined;
  const isViewingAsSuperAdmin = profileIdParam && currentProfile.role === "super_admin";

  let targetProfile = currentProfile;
  if (isViewingAsSuperAdmin && profileIdParam) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileIdParam))
      .limit(1);
    
    if (profile) {
      targetProfile = profile;
    }
  }

  let tenantId = targetProfile.tenantId;

  // If no tenantId, try to get from user's academies via memberships
  if (!tenantId && !isViewingAsSuperAdmin) {
    try {
      const userAcademies = await db
        .select({
          tenantId: academies.tenantId,
        })
        .from(memberships)
        .innerJoin(academies, eq(memberships.academyId, academies.id))
        .where(eq(memberships.userId, targetProfile.userId))
        .limit(1);

      if (userAcademies.length > 0) {
        tenantId = userAcademies[0].tenantId;
      }
    } catch (error) {
      console.error("Error getting tenant from academies:", error);
    }
  }

  if (!tenantId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Calendario no disponible</h1>
        <p className="text-muted-foreground">
          Debes pertenecer a un tenant para visualizar las sesiones programadas.
        </p>
      </div>
    );
  }

  // Optimización: Obtener el país de la primera academia del tenant para usar su zona horaria
  // Si hay múltiples academias, usamos la primera para determinar la zona horaria del calendario
  const [firstAcademy] = await db
    .select({ country: academies.country })
    .from(academies)
    .where(eq(academies.tenantId, tenantId))
    .orderBy(asc(academies.createdAt)) // Usar la academia más antigua para consistencia
    .limit(1);
  
  const academyCountry = firstAcademy?.country ?? null;

  const viewParam =
    typeof params.view === "string" && ["week", "month"].includes(params.view)
      ? (params.view as "week" | "month")
      : "week";
  const athleteIdParam = typeof params.athleteId === "string" ? params.athleteId : undefined;

  const referenceDate = parseDateParam(
    typeof params.date === "string" ? params.date : undefined
  );

  let rangeStart: Date;
  let rangeEnd: Date;

  if (viewParam === "week") {
    // Usar la función que respeta la zona horaria del país
    const weekBoundaries = getWeekBoundariesInCountryTimezone(referenceDate, academyCountry);
    rangeStart = weekBoundaries.start;
    rangeEnd = weekBoundaries.end;
  } else {
    // Usar la función que respeta la zona horaria del país para el mes también
    const monthBoundaries = getMonthBoundariesInCountryTimezone(referenceDate, academyCountry);
    rangeStart = monthBoundaries.start;
    rangeEnd = monthBoundaries.end;
  }

  let allowedClassIds: string[] | null = null;
  let calendarTitle = "Calendario de sesiones";
  let calendarDescription = "Visualiza las clases programadas y coordina los entrenadores asignados.";
  let limitedCalendarContext: string | null = null;
  const canOpenSessionDetails =
    targetProfile.role === "owner" || targetProfile.role === "admin" || targetProfile.role === "coach";

  if (targetProfile.role === "athlete") {
    const [athleteRow] = await db
      .select({
        id: athletes.id,
        academyId: athletes.academyId,
        groupId: athletes.groupId,
      })
      .from(athletes)
      .where(eq(athletes.userId, targetProfile.userId))
      .limit(1);

    if (athleteRow) {
      const classIdSet = new Set<string>();

      if (athleteRow.groupId) {
        const groupClassRows = await db
          .select({ classId: classes.id })
          .from(classes)
          .leftJoin(classGroups, eq(classGroups.classId, classes.id))
          .where(
            and(
              eq(classes.academyId, athleteRow.academyId),
              or(eq(classes.groupId, athleteRow.groupId), eq(classGroups.groupId, athleteRow.groupId))
            )
          );

        groupClassRows.forEach((row) => classIdSet.add(row.classId));
      }

      const enrollmentRows = await db
        .select({ classId: classEnrollments.classId })
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.athleteId, athleteRow.id),
            eq(classEnrollments.academyId, athleteRow.academyId)
          )
        );

      enrollmentRows.forEach((row) => classIdSet.add(row.classId));
      allowedClassIds = Array.from(classIdSet);
    } else {
      allowedClassIds = [];
    }

    calendarTitle = "Mi calendario";
    calendarDescription = "Consulta solo tus clases y sesiones programadas.";
    limitedCalendarContext = "Mostramos unicamente las actividades asociadas a tu perfil de atleta.";
  }

  if (targetProfile.role === "parent") {
    const linkedChildren = await db
      .select({
        athleteId: athletes.id,
        academyId: athletes.academyId,
        groupId: athletes.groupId,
        athleteName: athletes.name,
      })
      .from(guardianAthletes)
      .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
      .innerJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
      .where(eq(guardians.profileId, targetProfile.id));

    const selectedChildren =
      athleteIdParam && linkedChildren.some((child) => child.athleteId === athleteIdParam)
        ? linkedChildren.filter((child) => child.athleteId === athleteIdParam)
        : linkedChildren;

    const classIdSet = new Set<string>();

    for (const child of selectedChildren) {
      if (child.groupId) {
        const groupClassRows = await db
          .select({ classId: classes.id })
          .from(classes)
          .leftJoin(classGroups, eq(classGroups.classId, classes.id))
          .where(
            and(
              eq(classes.academyId, child.academyId),
              or(eq(classes.groupId, child.groupId), eq(classGroups.groupId, child.groupId))
            )
          );

        groupClassRows.forEach((row) => classIdSet.add(row.classId));
      }

      const enrollmentRows = await db
        .select({ classId: classEnrollments.classId })
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.athleteId, child.athleteId),
            eq(classEnrollments.academyId, child.academyId)
          )
        );

      enrollmentRows.forEach((row) => classIdSet.add(row.classId));
    }

    allowedClassIds = Array.from(classIdSet);
    const selectedChildName =
      athleteIdParam ? selectedChildren[0]?.athleteName ?? null : null;

    calendarTitle = selectedChildName ? `Calendario de ${selectedChildName}` : "Calendario familiar";
    calendarDescription = selectedChildName
      ? `Consulta las actividades programadas para ${selectedChildName}.`
      : "Consulta las actividades programadas para tus hijos asociados.";
    limitedCalendarContext = selectedChildName
      ? `Filtramos las sesiones para ${selectedChildName}.`
      : "Mostramos solo las actividades vinculadas a tus hijos.";
  }

  const sessions = await db
    .select({
      id: classSessions.id,
      date: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      classId: classes.id,
      className: classes.name,
      academyName: academies.name,
      coachName: coaches.name,
      isExtra: classes.isExtra,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(academies, eq(classes.academyId, academies.id))
    .leftJoin(coaches, eq(classSessions.coachId, coaches.id))
    .where(
      and(
        eq(classSessions.tenantId, tenantId),
        gte(classSessions.sessionDate, toISODate(rangeStart, academyCountry)),
        lte(classSessions.sessionDate, toISODate(rangeEnd, academyCountry)),
        allowedClassIds !== null ? inArray(classes.id, allowedClassIds.length > 0 ? allowedClassIds : ["__no-match__"]) : undefined
      )
    )
    .orderBy(asc(classSessions.sessionDate), asc(classSessions.startTime));

  let sessionsForCalendar: CalendarSessionEntry[] = sessions.map((session) => ({
    id: session.id,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    status: session.status,
    classId: session.classId ?? null,
    className: session.className ?? null,
    academyName: session.academyName ?? null,
    coachName: session.coachName ?? null,
    targetUrl: canOpenSessionDetails ? `/dashboard/sessions/${session.id}` : undefined,
    isExtra: session.isExtra ?? false,
  }));

  let usingPlaceholderSessions = false;

  if (sessionsForCalendar.length === 0) {
    const fallbackClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        academyId: classes.academyId,
        academyName: academies.name,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(classes)
      .innerJoin(academies, eq(classes.academyId, academies.id))
      .where(
        and(
          eq(classes.tenantId, tenantId),
          allowedClassIds !== null ? inArray(classes.id, allowedClassIds.length > 0 ? allowedClassIds : ["__no-match__"]) : undefined
        )
      )
      .orderBy(asc(classes.name))
      .limit(15);

    const classIds = fallbackClasses.map((item) => item.id);
    if (fallbackClasses.length > 0 && classIds.length > 0) {
      const weekdayRows = await db
        .select({
          classId: classWeekdays.classId,
          weekday: classWeekdays.weekday,
        })
        .from(classWeekdays)
        .where(inArray(classWeekdays.classId, classIds));

      const weekdayMap = weekdayRows.reduce((acc, row) => {
        const current = acc.get(row.classId) ?? [];
        current.push(row.weekday);
        acc.set(row.classId, current);
        return acc;
      }, new Map<string, number[]>());

      const placeholderSessions = fallbackClasses.flatMap((classRow) => {
        const weekdays = weekdayMap.get(classRow.id) ?? [];
        if (weekdays.length === 0) {
          return [];
        }

        const placeholders: Array<{
          id: string;
          date: string;
          startTime: string | null;
          endTime: string | null;
          status: string;
          classId: string;
          className: string | null;
          academyName: string | null;
          coachName: string | null;
          targetUrl?: string;
          isPlaceholder: boolean;
        }> = [];

        weekdays.forEach((weekday) => {
          let currentDate = getFirstDateForWeekdayInTimezone(rangeStart, weekday, academyCountry);
          // Normalizar rangeEnd usando la zona horaria del país
          const rangeEndNormalized = new Date(rangeEnd);
          rangeEndNormalized.setHours(23, 59, 59, 999); // Incluir todo el día final
          
          while (currentDate <= rangeEndNormalized) {
            placeholders.push({
              id: `placeholder-${classRow.id}-${currentDate.toISOString()}`,
              date: toISODate(currentDate, academyCountry),
              startTime: classRow.startTime,
              endTime: classRow.endTime,
              status: "placeholder",
              classId: classRow.id,
              className: classRow.name,
              academyName: classRow.academyName,
              coachName: null,
              targetUrl: canOpenSessionDetails ? `/app/${classRow.academyId}/classes/${classRow.id}` : undefined,
              isPlaceholder: true,
            });
            currentDate = addDays(currentDate, 7);
          }
        });

        return placeholders;
      });

      if (placeholderSessions.length > 0) {
        placeholderSessions.sort((a, b) => {
          if (a.date === b.date) {
            return (a.startTime ?? "").localeCompare(b.startTime ?? "");
          }
          return a.date.localeCompare(b.date);
        });
        sessionsForCalendar = placeholderSessions;
        usingPlaceholderSessions = true;
      }
    }
  }

  return (
    <div className="space-y-6 p-8">
      {isViewingAsSuperAdmin && profileIdParam && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-amber-600" strokeWidth={2} />
              <div>
                <p className="font-semibold text-amber-900">
                  Modo Super Admin: Viendo calendario de {targetProfile.name ?? "Usuario"}
                </p>
                <p className="text-sm text-amber-700">
                  Estás viendo el calendario de este usuario.
                </p>
              </div>
            </div>
            <Link
              href={`/super-admin/users/${profileIdParam}`}
              className="inline-flex items-center gap-2 rounded-md border border-amber-600/40 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-50"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
              Volver a Super Admin
            </Link>
          </div>
        </div>
      )}
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Calendario" },
        ]}
        title={calendarTitle}
        description={calendarDescription}
        icon={<CalendarDays className="h-5 w-5" strokeWidth={1.5} />}
      />
      {limitedCalendarContext && (
        <div className="rounded-lg border border-border bg-card/70 p-4 text-sm text-muted-foreground">
          {limitedCalendarContext}
        </div>
      )}
      {usingPlaceholderSessions && (
        <div className="rounded-lg border border-dashed border-amber-400/70 bg-amber-50/80 p-4 text-sm text-amber-900">
          <p className="font-semibold">No hay sesiones generadas todavía.</p>
          <p className="text-amber-800">
            {canOpenSessionDetails
              ? "Mostramos tus clases según los dias configurados para que puedas visualizar la carga semanal. Usa la opcion Generar sesiones en el modulo de clases para convertirlas en sesiones reales del calendario."
              : "Mostramos las actividades segun los dias configurados para que puedas visualizar la agenda prevista aunque todavia no existan sesiones generadas."}
          </p>
        </div>
      )}
      <CalendarView
        view={viewParam}
        referenceDate={formatDateToISOString(referenceDate, academyCountry)}
        rangeStart={formatDateToISOString(rangeStart, academyCountry)}
        rangeEnd={formatDateToISOString(rangeEnd, academyCountry)}
        sessions={sessionsForCalendar}
        academyCountry={academyCountry}
      />
    </div>
  );
}
