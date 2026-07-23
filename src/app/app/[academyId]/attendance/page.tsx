import Link from "next/link";
import { desc, eq, inArray, count, asc } from "drizzle-orm";
import { ClipboardCheck } from "lucide-react";

import { db } from "@/db";
import { formatShortDateForCountry, formatTimeForCountry } from "@/lib/date-utils";
import {
  academies,
  attendanceRecords,
  classCoachAssignments,
  classSessions,
  classes,
  coaches,
  groups,
} from "@/db/schema";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/**
 * AttendanceOverviewPage - Vista principal de asistencia
 * 
 * Muestra las sesiones recientes con sus registros de asistencia, permitiendo
 * acceder rápidamente al detalle de cada sesión para revisar o registrar asistencia.
 */
interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function AttendanceOverviewPage({ params }: PageProps) {
  const { academyId } = await params;

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      country: academies.country,
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
    <div className="mx-auto max-w-[1500px] space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Asistencia" },
        ]}
        title="Asistencia"
        description="Revisa las sesiones recientes y accede rápidamente al registro de asistencia."
        icon={<ClipboardCheck className="h-5 w-5" strokeWidth={1.8} />}
        actions={
          <Link
            href={`/app/${academyId}/attendance/today`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark"
          >
            Pasar lista de hoy
          </Link>
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Aún no has registrado ninguna sesión"
          description="Crea clases y genera sesiones para empezar a llevar el control de asistencia de tus gimnastas."
          action={
            <Link
              href={`/app/${academyId}/classes`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-primary-dark"
            >
              Crear primera clase
            </Link>
          }
        />
      ) : (
        <>
        {/* Cards — móvil */}
        <ul className="space-y-3 md:hidden">
          {sessionsWithGroups.map((session) => {
            const attendanceCount = countMap.get(session.id) ?? 0;
            return (
              <li key={session.id} className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.45)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{session.className ?? "Clase"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatShortDateForCountry(session.sessionDate, academy?.country ?? null)}
                      {" · "}
                      {session.startTime && session.endTime
                        ? `${formatTimeForCountry(session.sessionDate + "T" + session.startTime, academy?.country ?? null)} – ${formatTimeForCountry(session.sessionDate + "T" + session.endTime, academy?.country ?? null)}`
                        : session.startTime
                        ? `Desde ${formatTimeForCountry(session.sessionDate + "T" + session.startTime, academy?.country ?? null)}`
                        : "Sin horario"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{session.coachName ?? "Sin asignar"}</p>
                  </div>
                  <Link
                    href={`/app/${academyId}/classes/${session.classId}`}
                    className="shrink-0 text-xs font-semibold text-primary hover:underline"
                  >
                    Revisar
                  </Link>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {session.groups.length === 0 ? (
                    <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">Sin grupo</span>
                  ) : (
                    session.groups.map((group) => (
                      <span
                        key={group.id}
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium"
                        style={group.color ? { borderColor: group.color, color: group.color } : undefined}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color ?? "currentColor" }} />
                        {group.name}
                      </span>
                    ))
                  )}
                </div>

                <p className="mt-3 text-xs font-medium text-muted-foreground">
                  {attendanceCount === 0 ? "Sin registros" : `${attendanceCount} ${attendanceCount === 1 ? "registro" : "registros"}`}
                </p>
              </li>
            );
          })}
        </ul>

        {/* Tabla — escritorio */}
        <div className="hidden overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] md:block">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/80">
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
            <tbody className="divide-y divide-slate-100 bg-white text-foreground">
              {sessionsWithGroups.map((session) => {
                const attendanceCount = countMap.get(session.id) ?? 0;
                return (
                  <tr key={session.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{session.className ?? "Clase"}</td>
                    <td className="px-4 py-3">{formatShortDateForCountry(session.sessionDate, academy?.country ?? null)}</td>
                    <td className="px-4 py-3">
                      {session.startTime && session.endTime
                        ? `${formatTimeForCountry(session.sessionDate + "T" + session.startTime, academy?.country ?? null)} – ${formatTimeForCountry(session.sessionDate + "T" + session.endTime, academy?.country ?? null)}`
                        : session.startTime
                        ? `Desde ${formatTimeForCountry(session.sessionDate + "T" + session.startTime, academy?.country ?? null)}`
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
        </>
      )}
    </div>
  );
}

