import Link from "next/link";
import { desc, eq, inArray, count, asc } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  attendanceRecords,
  classCoachAssignments,
  classSessions,
  classes,
  coaches,
  groups,
} from "@/db/schema";

/**
 * AttendanceOverviewPage - Vista principal de asistencia
 * 
 * Muestra las sesiones recientes con sus registros de asistencia, permitiendo
 * acceder rápidamente al detalle de cada sesión para revisar o registrar asistencia.
 */
interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function AttendanceOverviewPage({ params }: PageProps) {
  const { academyId } = params;

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
    })
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

  const sessionRows = await db
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      coachId: classSessions.coachId,
      classId: classes.id,
      className: classes.name,
      coachName: coaches.name,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .leftJoin(coaches, eq(classSessions.coachId, coaches.id))
    .where(eq(classes.academyId, academyId))
    .orderBy(desc(classSessions.sessionDate), desc(classSessions.startTime))
    .limit(25);

  const sessionIds = sessionRows.map((row) => row.id);
  const classIds = Array.from(new Set(sessionRows.map((row) => row.classId)));

  const attendanceCounts =
    sessionIds.length === 0
      ? []
      : await db
          .select({
            sessionId: attendanceRecords.sessionId,
            total: count(attendanceRecords.id),
          })
          .from(attendanceRecords)
          .where(inArray(attendanceRecords.sessionId, sessionIds))
          .groupBy(attendanceRecords.sessionId);

  const countMap = new Map<string, number>();
  for (const row of attendanceCounts) {
    countMap.set(row.sessionId, Number(row.total ?? 0));
  }

  const groupRows = await db
    .select({
      id: groups.id,
      name: groups.name,
      color: groups.color,
      coachId: groups.coachId,
      assistantIds: groups.assistantIds,
    })
    .from(groups)
    .where(eq(groups.academyId, academyId))
    .orderBy(asc(groups.name));

  const groupsByCoach = new Map<string, { id: string; name: string; color: string | null }[]>();
  groupRows.forEach((group) => {
    const groupInfo = {
      id: group.id,
      name: group.name ?? "Grupo sin nombre",
      color: group.color ?? null,
    };
    if (group.coachId) {
      const bucket = groupsByCoach.get(group.coachId) ?? [];
      if (!bucket.some((entry) => entry.id === groupInfo.id)) {
        bucket.push(groupInfo);
      }
      groupsByCoach.set(group.coachId, bucket);
    }
    if (Array.isArray(group.assistantIds)) {
      group.assistantIds.forEach((assistantId) => {
        const bucket = groupsByCoach.get(assistantId) ?? [];
        if (!bucket.some((entry) => entry.id === groupInfo.id)) {
          bucket.push(groupInfo);
        }
        groupsByCoach.set(assistantId, bucket);
      });
    }
  });

  const classAssignments =
    classIds.length === 0
      ? []
      : await db
          .select({
            classId: classCoachAssignments.classId,
            coachId: classCoachAssignments.coachId,
          })
          .from(classCoachAssignments)
          .where(inArray(classCoachAssignments.classId, classIds));

  const classCoachMap = new Map<string, string[]>();
  classAssignments.forEach((assignment) => {
    const list = classCoachMap.get(assignment.classId) ?? [];
    list.push(assignment.coachId);
    classCoachMap.set(assignment.classId, list);
  });

  const sessionsWithGroups = sessionRows.map((session) => {
    const groupMap = new Map<string, { id: string; name: string; color: string | null }>();

    const classCoaches = classCoachMap.get(session.classId) ?? [];
    classCoaches.forEach((coachId) => {
      (groupsByCoach.get(coachId) ?? []).forEach((group) => {
        groupMap.set(group.id, group);
      });
    });

    if (session.coachId) {
      (groupsByCoach.get(session.coachId) ?? []).forEach((group) => {
        groupMap.set(group.id, group);
      });
    }

    return {
      ...session,
      groups: Array.from(groupMap.values()),
    };
  });

  const isEmpty = sessionsWithGroups.length === 0;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2 py-6">
        <h1 className="text-3xl font-semibold">Asistencia</h1>
        <p className="text-sm text-muted-foreground">
          Revisa las sesiones recientes y accede rápidamente al registro de asistencia.
        </p>
      </header>

      {isEmpty ? (
        <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
          <p className="mb-4 text-sm text-muted-foreground">
            Aún no has registrado ninguna sesión. Crea clases y genera sesiones para empezar a llevar el control de asistencia de tus atletas.
          </p>
          <Link
            href={`/app/${academyId}/classes`}
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
          >
            Crear primera clase
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Clase</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Horario</th>
                <th className="px-4 py-3 font-medium">Coach</th>
                <th className="px-4 py-3 font-medium">Grupos</th>
                <th className="px-4 py-3 font-medium">Asistencia</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background text-foreground">
              {sessionsWithGroups.map((session) => {
                const attendanceCount = countMap.get(session.id) ?? 0;
                return (
                  <tr key={session.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{session.className ?? "Clase"}</td>
                    <td className="px-4 py-3">{session.sessionDate}</td>
                    <td className="px-4 py-3">
                      {session.startTime && session.endTime
                        ? `${session.startTime} – ${session.endTime}`
                        : session.startTime
                        ? `Desde ${session.startTime}`
                        : "Sin horario"}
                    </td>
                    <td className="px-4 py-3">{session.coachName ?? "Sin asignar"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {session.groups.length === 0 ? (
                          <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                            Sin grupo
                          </span>
                        ) : (
                          session.groups.map((group) => (
                            <span
                              key={group.id}
                              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium"
                              style={
                                group.color
                                  ? {
                                      borderColor: group.color,
                                      color: group.color,
                                    }
                                  : undefined
                              }
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: group.color ?? "currentColor" }}
                              />
                              {group.name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {attendanceCount === 0 ? "Sin registros" : `${attendanceCount} ${attendanceCount === 1 ? "registro" : "registros"}`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/app/${academyId}/classes/${session.classId}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Revisar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


