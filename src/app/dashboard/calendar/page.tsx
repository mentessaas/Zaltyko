import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  classSessions,
  classes,
  coaches,
  profiles,
} from "@/db/schema";
import CalendarView from "@/components/calendar/CalendarView";
import { createClient } from "@/lib/supabase/server";

interface CalendarPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

function parseDateParam(value?: string): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
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

  const tenantId = profile.tenantId;

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
    const day = referenceDate.getDay();
    const diff = day === 0 ? -6 : 1 - day; // start Monday
    rangeStart = new Date(referenceDate);
    rangeStart.setDate(referenceDate.getDate() + diff);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeStart.getDate() + 6);
  } else {
    rangeStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    rangeEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
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
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(academies, eq(classes.academyId, academies.id))
    .leftJoin(coaches, eq(classSessions.coachId, coaches.id))
    .where(
      and(
        eq(classSessions.tenantId, tenantId),
        gte(classSessions.sessionDate, toISODate(rangeStart)),
        lte(classSessions.sessionDate, toISODate(rangeEnd))
      )
    )
    .orderBy(asc(classSessions.sessionDate), asc(classSessions.startTime));

  return (
    <div className="space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Calendario de sesiones</h1>
        <p className="text-muted-foreground">
          Visualiza las clases programadas y coordina los entrenadores asignados.
        </p>
      </header>
      <CalendarView
        view={viewParam}
        referenceDate={referenceDate.toISOString()}
        rangeStart={rangeStart.toISOString()}
        rangeEnd={rangeEnd.toISOString()}
        sessions={sessions.map((session) => ({
          ...session,
          date: session.date,
        }))}
      />
    </div>
  );
}


