import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, and, eq, gte, lte } from "drizzle-orm";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";

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
import { getCoachSchedule } from "@/app/actions/classes/get-coach-schedule";
import CoachTodayView from "@/components/coaches/CoachTodayView";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function CoachTodayPage({ params }: PageProps) {
  const { academyId } = params;

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
    .where(and(eq(coaches.academyId, academyId), eq(coaches.email, profile.email ?? "")))
    .limit(1);

  if (!coach) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-6">
          <p className="text-sm text-amber-900">
            No se encontró un perfil de entrenador asociado a tu cuenta para esta academia.
          </p>
        </div>
      </div>
    );
  }

  // Obtener fecha de hoy
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

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
        eq(classSessions.sessionDate, format(today, "yyyy-MM-dd")),
        eq(classes.academyId, academyId)
      )
    )
    .orderBy(asc(classSessions.startTime));

  // Obtener horario completo del entrenador (para mostrar todas sus clases)
  const scheduleResult = await getCoachSchedule({
    coachId: coach.id,
    academyId,
    startDate: format(todayStart, "yyyy-MM-dd"),
    endDate: format(todayEnd, "yyyy-MM-dd"),
  });

  const allClasses = scheduleResult.items || [];

  // Obtener información de la academia
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
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
        today={format(today, "yyyy-MM-dd")}
      />
    </div>
  );
}

