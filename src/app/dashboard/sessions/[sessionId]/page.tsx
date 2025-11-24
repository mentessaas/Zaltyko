import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  attendanceRecords,
  classSessions,
  classes,
  coaches,
  profiles,
} from "@/db/schema";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";
import SessionAttendanceForm from "@/components/sessions/SessionAttendanceForm";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateForCountry, formatTimeForCountry } from "@/lib/date-utils";

interface SessionPageProps {
  params: {
    sessionId: string;
  };
}

export default async function SessionPage({ params }: SessionPageProps) {
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

  const sessionId = params.sessionId;

  const [sessionRow] = await db
    .select({
      id: classSessions.id,
      date: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      notes: classSessions.notes,
      classId: classes.id,
      className: classes.name,
      academyId: classes.academyId,
      academyName: academies.name,
      academyCountry: academies.country,
      coachId: classSessions.coachId,
      coachName: coaches.name,
      tenantId: classSessions.tenantId,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(academies, eq(classes.academyId, academies.id))
    .leftJoin(coaches, eq(classSessions.coachId, coaches.id))
    .where(eq(classSessions.id, sessionId))
    .limit(1);

  if (!sessionRow) {
    notFound();
  }

  if (profile.tenantId && sessionRow.tenantId !== profile.tenantId) {
    redirect("/dashboard/calendar");
  }

  // Obtener atletas de la clase (grupo base + enrollments)
  const classAthletes = await getClassAthletes(sessionRow.classId, sessionRow.academyId);
  
  // Convertir a formato esperado por SessionAttendanceForm
  const athleteRows = classAthletes.map((athlete) => ({
    id: athlete.id,
    name: athlete.name,
  }));

  const attendanceRows = await db
    .select({
      id: attendanceRecords.id,
      athleteId: attendanceRecords.athleteId,
      status: attendanceRecords.status,
      notes: attendanceRecords.notes,
    })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.sessionId, sessionId));

  return (
    <div className="space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">{sessionRow.className ?? "Sesión"}</h1>
        <p className="text-muted-foreground">
          {sessionRow.academyName ?? "Academia"} · {formatShortDateForCountry(sessionRow.date, sessionRow.academyCountry)}
          {sessionRow.startTime ? ` · ${formatTimeForCountry(sessionRow.date + "T" + sessionRow.startTime, sessionRow.academyCountry)}` : ""}{" "}
          {sessionRow.endTime ? `- ${formatTimeForCountry(sessionRow.date + "T" + sessionRow.endTime, sessionRow.academyCountry)}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          Entrenador asignado: {sessionRow.coachName ?? "Sin asignar"}
        </p>
      </header>

      <SessionAttendanceForm
        sessionId={sessionRow.id}
        sessionDate={sessionRow.date}
        athletes={athleteRows}
        existingAttendance={attendanceRows}
        academyCountry={sessionRow.academyCountry ?? null}
      />
    </div>
  );
}


