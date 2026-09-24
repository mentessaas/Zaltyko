import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  classCoachAssignments,
  classSessions,
  classWeekdays,
  classes,
  coaches,
  profiles,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { formatDateToISOString } from "@/lib/date-utils";
import { getCoachSchedule } from "@/app/actions/classes/get-coach-schedule";
import CoachTodayView from "@/components/coaches/CoachTodayView";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function CoachTodayPage({ params }: PageProps) {
  const { academyId } = await params;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/dashboard");
  }

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      country: academies.country,
      tenantId: academies.tenantId,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  // Obtener el entrenador asociado al usuario actual
  const [coach] = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
      academyId: coaches.academyId,
      tenantId: coaches.tenantId,
    })
    .from(coaches)
    .where(
      and(
        eq(coaches.academyId, academyId),
        eq(coaches.tenantId, academy.tenantId),
        or(eq(coaches.profileId, profile.id), eq(coaches.email, user.email ?? ""))
      )
    )
    .limit(1);

  if (!coach) {
    return (
      <div className="space-y-6 py-6 lg:py-8">
        <div className="rounded-2xl border border-zaltyko-indigo/20 bg-zaltyko-indigo/10 p-6">
          <p className="text-sm text-zaltyko-indigo">
            No se encontró un perfil de staff asociado a tu cuenta para esta academia.
          </p>
        </div>
      </div>
    );
  }

  // La jornada se calcula en la zona horaria de la academia, no en la del
  // servidor que renderiza la página.
  const today = formatDateToISOString(new Date(), academy.country);

  // Obtener sesiones del día de hoy
  const todaySessions = await db
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      notes: classSessions.notes,
      classId: classes.id,
      className: classes.name,
      isExtra: classes.isExtra,
      academyId: classes.academyId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(classSessions.coachId, coach.id),
        eq(classSessions.tenantId, academy.tenantId),
        eq(classSessions.sessionDate, today),
        eq(classes.academyId, academyId),
        eq(classes.tenantId, academy.tenantId),
        isNull(classes.deletedAt)
      )
    )
    .orderBy(asc(classSessions.startTime))
    .limit(500);

  // Obtener horario completo del entrenador (para mostrar todas sus clases)
  const scheduleResult = await getCoachSchedule({
    coachId: coach.id,
    academyId,
    startDate: today,
    endDate: today,
  });

  const allClasses = scheduleResult.items || [];

  return (
    <div className="space-y-6 py-6 lg:py-8">
      <CoachTodayView
        coach={coach}
        academy={academy}
        todaySessions={todaySessions.map((session) => ({
          id: session.id,
          date: session.sessionDate,
          startTime: session.startTime,
          endTime: session.endTime,
          status: session.status,
          notes: session.notes,
          classId: session.classId,
          className: session.className ?? "Clase sin nombre",
          isExtra: session.isExtra ?? false,
        }))}
        allClasses={allClasses}
        today={today}
      />
    </div>
  );
}
