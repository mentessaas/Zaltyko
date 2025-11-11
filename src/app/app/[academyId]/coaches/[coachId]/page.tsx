import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  attendanceRecords,
  classCoachAssignments,
  classSessions,
  classes,
  groups,
  coaches,
} from "@/db/schema";

interface PageProps {
  params: {
    academyId: string;
    coachId: string;
  };
}

export default async function CoachDetailPage({ params }: PageProps) {
  const { academyId, coachId } = params;

  const [coachRow] = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
      phone: coaches.phone,
      createdAt: coaches.createdAt,
      academyOwner: coaches.academyId,
      tenantId: coaches.tenantId,
    })
    .from(coaches)
    .where(eq(coaches.id, coachId))
    .limit(1);

  if (!coachRow || coachRow.academyOwner !== academyId) {
    notFound();
  }

  const classAssignments = await db
    .select({
      id: classes.id,
      name: classes.name,
      weekday: classes.weekday,
      startTime: classes.startTime,
      endTime: classes.endTime,
    })
    .from(classCoachAssignments)
    .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
    .where(eq(classCoachAssignments.coachId, coachId))
    .orderBy(asc(classes.name));

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

  const principalGroups = groupRows
    .filter((group) => group.coachId === coachId)
    .map((group) => ({
      id: group.id,
      name: group.name ?? "Grupo sin nombre",
      color: group.color ?? null,
    }));

  const assistantGroups = groupRows
    .filter(
      (group) => Array.isArray(group.assistantIds) && group.assistantIds.includes(coachId)
    )
    .map((group) => ({
      id: group.id,
      name: group.name ?? "Grupo sin nombre",
      color: group.color ?? null,
    }));

  const recentSessions = await db
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: classSessions.status,
      className: classes.name,
      classId: classes.id,
      attendanceCount: sql<number>`count(${attendanceRecords.id})`,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, classSessions.id))
    .where(eq(classSessions.coachId, coachId))
    .groupBy(classSessions.id, classes.name, classes.id)
    .orderBy(desc(classSessions.sessionDate), desc(classSessions.startTime))
    .limit(10);

  const sessionTotals = await db
    .select({
      total: count(classSessions.id),
    })
    .from(classSessions)
    .where(eq(classSessions.coachId, coachId));

  const totalSessions = Number(sessionTotals[0]?.total ?? 0);

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <Link
        href={`/app/${academyId}/coaches`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
      >
        ← Volver a entrenadores
      </Link>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Entrenador</p>
            <h1 className="text-3xl font-semibold text-foreground">{coachRow.name}</h1>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
                Clases asignadas: {classAssignments.length}
              </span>
              <span className="rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground">
                Grupos principales: {principalGroups.length}
              </span>
              <span className="rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground">
                Grupos asistente: {assistantGroups.length}
              </span>
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>
              Alta:{" "}
              {coachRow.createdAt
                ? new Date(coachRow.createdAt).toLocaleDateString("es-ES")
                : "—"}
            </p>
            <p>Sesiones lideradas: {totalSessions}</p>
          </div>
        </header>

        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-border/60 bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Correo</p>
            <p className="mt-1 font-semibold text-foreground">
              {coachRow.email ?? "No especificado"}
            </p>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Teléfono</p>
            <p className="mt-1 font-semibold text-foreground">
              {coachRow.phone ?? "No especificado"}
            </p>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Tenant ID
            </p>
            <p className="mt-1 font-semibold text-foreground break-all">{coachRow.tenantId}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <header>
            <h2 className="text-lg font-semibold text-foreground">Clases asignadas</h2>
            <p className="text-sm text-muted-foreground">
              Clases en las que figura como entrenador responsable.
            </p>
          </header>

          {classAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no tiene clases asignadas. Desde la vista de clases puedes asignarlo.
            </p>
          ) : (
            <div className="space-y-3">
              {classAssignments.map((classItem) => (
                <div
                  key={classItem.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/30 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-foreground">{classItem.name ?? "Clase"}</p>
                    <p className="text-xs text-muted-foreground">
                      {typeof classItem.weekday === "number"
                        ? `Día ${classItem.weekday}`
                        : "Día variable"}{" "}
                      ·{" "}
                      {classItem.startTime && classItem.endTime
                        ? `${classItem.startTime} – ${classItem.endTime}`
                        : classItem.startTime
                        ? `Desde ${classItem.startTime}`
                        : "Horario no definido"}
                    </p>
                  </div>
                  <Link
                    href={`/app/${academyId}/classes/${classItem.id}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Ver clase
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <header>
            <h2 className="text-lg font-semibold text-foreground">Grupos</h2>
            <p className="text-sm text-muted-foreground">
              Equipos o grupos donde participa como responsable o asistente.
            </p>
          </header>

          <div className="space-y-3 text-sm">
            {principalGroups.length === 0 && assistantGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no participa en ningún grupo. Puedes asignarlo desde el módulo de grupos.
              </p>
            ) : (
              <>
                {principalGroups.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Entrenador principal
                    </h3>
                    <ul className="space-y-2">
                      {principalGroups.map((group) => (
                        <li
                          key={group.id}
                          className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2"
                        >
                          <span
                            className="inline-flex items-center gap-2 font-semibold"
                            style={
                              group.color
                                ? {
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
                          <Link
                            href={`/app/${academyId}/groups/${group.id}`}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Ver grupo
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {assistantGroups.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Asistente
                    </h3>
                    <ul className="space-y-2">
                      {assistantGroups.map((group) => (
                        <li
                          key={group.id}
                          className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2"
                        >
                          <span
                            className="inline-flex items-center gap-2"
                            style={
                              group.color
                                ? {
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
                          <Link
                            href={`/app/${academyId}/groups/${group.id}`}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Ver grupo
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">Sesiones lideradas recientemente</h2>
          <p className="text-sm text-muted-foreground">
            Sesiones del calendario donde figuró como entrenador principal.
          </p>
        </header>

        {recentSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay registros recientes de sesiones con este entrenador.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Clase</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Horario</th>
                  <th className="px-4 py-3 font-medium text-right">Asistencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background text-foreground">
                {recentSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-semibold">
                      <Link
                        href={`/app/${academyId}/classes/${session.classId}`}
                        className="text-primary hover:underline"
                      >
                        {session.className ?? "Clase"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{session.sessionDate}</td>
                    <td className="px-4 py-3">
                      {session.startTime && session.endTime
                        ? `${session.startTime} – ${session.endTime}`
                        : session.startTime
                        ? `Desde ${session.startTime}`
                        : "Sin horario"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {Number(session.attendanceCount ?? 0)} registros
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

