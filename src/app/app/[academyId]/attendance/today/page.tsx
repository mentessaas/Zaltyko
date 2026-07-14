import Link from "next/link";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { ClipboardCheck } from "lucide-react";

import { db } from "@/db";
import { formatTimeForCountry } from "@/lib/date-utils";
import { academies, attendanceRecords, classSessions, classes, coaches } from "@/db/schema";
import { EmptyState } from "@/components/ui/empty-state";

interface PageProps {
  params: Promise<{ academyId: string }>;
}

export default async function AttendanceTodayPage({ params }: PageProps) {
  const { academyId } = await params;

  const [academy] = await db
    .select({ id: academies.id, name: academies.name, country: academies.country })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Academia no encontrada.</p>
      </div>
    );
  }

  const todayStr = new Date().toISOString().split("T")[0];

  const todaySessions = await db
    .select({
      id: classSessions.id,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      classId: classes.id,
      className: classes.name,
      coachName: coaches.name,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .leftJoin(coaches, eq(classSessions.coachId, coaches.id))
    .where(and(eq(classes.academyId, academyId), eq(classSessions.sessionDate, todayStr)))
    .orderBy(asc(classSessions.startTime));

  const sessionIds = todaySessions.map((row) => row.id);

  const attendanceCounts =
    sessionIds.length === 0
      ? []
      : await db
          .select({ sessionId: attendanceRecords.sessionId, total: count(attendanceRecords.id) })
          .from(attendanceRecords)
          .where(inArray(attendanceRecords.sessionId, sessionIds))
          .groupBy(attendanceRecords.sessionId);

  const countMap = new Map<string, number>();
  for (const row of attendanceCounts) {
    countMap.set(row.sessionId, Number(row.total ?? 0));
  }

  const isEmpty = todaySessions.length === 0;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-1 py-4">
        <h1 className="font-display text-2xl font-bold text-zaltyko-navy">Pasar lista</h1>
        <p className="text-sm text-muted-foreground">Sesiones de hoy · {todayStr}</p>
      </header>

      {isEmpty ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No hay sesiones programadas para hoy"
          description="Cuando tengas clases programadas para hoy, aparecerán aquí para pasar lista en segundos."
          action={
            <Link
              href={`/app/${academyId}/classes`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-primary-dark"
            >
              Ver clases
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {todaySessions.map((session) => {
            const marked = countMap.get(session.id) ?? 0;
            return (
              <li key={session.id}>
                <Link
                  href={`/app/${academyId}/attendance/today/${session.id}`}
                  className="flex min-h-[64px] items-center justify-between rounded-2xl border border-zaltyko-mist bg-white px-4 py-3 shadow-soft active:border-zaltyko-teal"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zaltyko-navy">{session.className ?? "Clase"}</p>
                    <p className="truncate text-xs text-zaltyko-text-secondary">
                      {session.startTime
                        ? formatTimeForCountry(`${todayStr}T${session.startTime}`, academy.country)
                        : "Sin horario"}
                      {session.coachName ? ` · ${session.coachName}` : ""}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 rounded-full bg-zaltyko-teal/10 px-3 py-1 text-xs font-semibold tabular-nums text-zaltyko-teal">
                    {marked > 0 ? `${marked} marcadas` : "Sin marcar"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
