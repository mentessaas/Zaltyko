import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { addDays, getDay } from "date-fns";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

import { db } from "@/db";
import { academies, classSessions, classes, classWeekdays, coaches, profiles } from "@/db/schema";
import CalendarView from "@/components/calendar/CalendarView";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { formatDateToISOString, getWeekBoundariesInCountryTimezone, getMonthBoundariesInCountryTimezone, getFirstDateForWeekdayInTimezone } from "@/lib/date-utils";

interface CalendarPageProps {
  searchParams: Record<string, string | string[] | undefined>;
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
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const currentProfile = await getCurrentProfile(user.id);
  if (!currentProfile) {
    redirect("/dashboard");
  }

  // Si hay un profileId en los searchParams y el usuario es Super Admin, usar ese perfil
  const profileIdParam = typeof searchParams.profileId === "string" ? searchParams.profileId : undefined;
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

  const tenantId = targetProfile.tenantId;

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
    typeof searchParams.view === "string" && ["week", "month"].includes(searchParams.view)
      ? (searchParams.view as "week" | "month")
      : "week";

  const referenceDate = parseDateParam(
    typeof searchParams.date === "string" ? searchParams.date : undefined
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
        lte(classSessions.sessionDate, toISODate(rangeEnd, academyCountry))
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
    targetUrl: `/dashboard/sessions/${session.id}`,
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
      .where(eq(classes.tenantId, tenantId))
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
          targetUrl: string;
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
              targetUrl: `/app/${classRow.academyId}/classes/${classRow.id}`,
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
      <header className="space-y-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendario de sesiones</h1>
          <p className="mt-2 text-muted-foreground">
            Visualiza las clases programadas y coordina los entrenadores asignados.
          </p>
        </div>
      </header>
      {usingPlaceholderSessions && (
        <div className="rounded-lg border border-dashed border-amber-400/70 bg-amber-50/80 p-4 text-sm text-amber-900">
          <p className="font-semibold">No hay sesiones generadas todavía.</p>
          <p className="text-amber-800">
            Mostramos tus clases según los días configurados para que puedas visualizar la carga semanal.
            Usa la opción “Generar sesiones” en el módulo de clases para convertirlas en sesiones reales del calendario.
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


