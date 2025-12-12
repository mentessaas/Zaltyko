import { notFound } from "next/navigation";
import { asc, count, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import {
  academies,
  athletes,
  attendanceRecords,
  classSessions,
  classes,
  familyContacts,
  guardianAthletes,
  guardians,
  groups,
} from "@/db/schema";
import { AthleteAccountSection } from "@/components/athletes/AthleteAccountSection";
import { AthleteBaseClassesSection } from "@/components/athletes/AthleteBaseClassesSection";
import { AthleteExtraClassesSection } from "@/components/athletes/AthleteExtraClassesSection";
import { coaches } from "@/db/schema";

interface PageProps {
  params: {
    academyId: string;
    athleteId: string;
  };
}

const STATUS_LABELS: Record<string, string> = {
  present: "Presente",
  absent: "Ausente",
  late: "Tarde",
  excused: "Justificada",
};

function calculateAge(dob: Date | string | null): number | null {
  if (!dob) return null;
  const date = typeof dob === "string" ? new Date(dob) : dob;
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

export default async function AthleteDetailPage({ params }: PageProps) {
  const { academyId, athleteId } = params;

  const [athleteRow] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      dob: athletes.dob,
      createdAt: athletes.createdAt,
      groupId: athletes.groupId,
      groupName: groups.name,
      groupColor: groups.color,
      tenantId: athletes.tenantId,
      academyOwner: athletes.academyId,
    })
    .from(athletes)
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athleteRow || athleteRow.academyOwner !== academyId) {
    notFound();
  }

  const age = calculateAge(athleteRow.dob);

  const contacts = await db
    .select({
      id: familyContacts.id,
      name: familyContacts.name,
      relationship: familyContacts.relationship,
      email: familyContacts.email,
      phone: familyContacts.phone,
      notifyEmail: familyContacts.notifyEmail,
      notifySms: familyContacts.notifySms,
    })
    .from(familyContacts)
    .where(eq(familyContacts.athleteId, athleteId))
    .orderBy(asc(familyContacts.name));

  const guardiansList = await db
    .select({
      id: guardians.id,
      name: guardians.name,
      email: guardians.email,
      phone: guardians.phone,
      relationship: guardianAthletes.relationship,
      isPrimary: guardianAthletes.isPrimary,
    })
    .from(guardianAthletes)
    .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .where(eq(guardianAthletes.athleteId, athleteId))
    .orderBy(desc(guardianAthletes.isPrimary), asc(guardians.name));

  const attendanceSummary = await db
    .select({
      status: attendanceRecords.status,
      total: count(attendanceRecords.id),
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(eq(attendanceRecords.athleteId, athleteId))
    .groupBy(attendanceRecords.status);

  const recentSessions = await db
    .select({
      sessionDate: classSessions.sessionDate,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      status: attendanceRecords.status,
      recordedAt: attendanceRecords.recordedAt,
      className: classes.name,
      classId: classes.id,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(eq(attendanceRecords.athleteId, athleteId))
    .orderBy(desc(attendanceRecords.recordedAt))
    .limit(10);

  const attendanceTotals = attendanceSummary.reduce(
    (accumulator, item) => ({
      ...accumulator,
      [item.status]: Number(item.total ?? 0),
    }),
    {} as Record<string, number>
  );

  const totalSessions = Object.values(attendanceTotals).reduce((sum, value) => sum + value, 0);

  // Obtener coaches disponibles para clases extra
  const availableCoaches = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
    })
    .from(coaches)
    .where(eq(coaches.academyId, academyId))
    .orderBy(asc(coaches.name));

  let formattedDob: string | null = null;
  if (athleteRow.dob) {
    if (typeof athleteRow.dob === "string") {
      formattedDob = athleteRow.dob.slice(0, 10);
    } else {
      const dobDate = athleteRow.dob as Date;
      formattedDob = dobDate.toISOString().slice(0, 10);
    }
  }

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <Link
        href={`/app/${academyId}/athletes`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
      >
        ← Volver a atletas
      </Link>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Atleta</p>
              <h1 className="text-3xl font-semibold text-foreground">{athleteRow.name}</h1>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
                  Estado: {athleteRow.status}
                </span>
                {athleteRow.level && (
                  <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">
                    Nivel: {athleteRow.level}
                  </span>
                )}
                {athleteRow.groupName && (
                  <span
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium"
                    style={
                      athleteRow.groupColor
                        ? {
                            borderColor: athleteRow.groupColor,
                            color: athleteRow.groupColor,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: athleteRow.groupColor ?? "currentColor" }}
                    />
                    {athleteRow.groupName}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>
                Registrado el{" "}
                {athleteRow.createdAt
                  ? new Date(athleteRow.createdAt).toLocaleDateString("es-ES")
                  : "—"}
              </p>
              <p>Edad: {age ?? "No disponible"}</p>
              {formattedDob && <p>Nacido el {formattedDob}</p>}
            </div>
          </header>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Asistencia</h2>
          <p className="text-sm text-muted-foreground">
            Resumen de las asistencias registradas en las sesiones vinculadas.
          </p>
          <div className="mt-4 grid gap-3">
            <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
              <span>Total sesiones</span>
              <span className="font-semibold">{totalSessions}</span>
            </div>
            {Object.entries(attendanceTotals).map(([status, value]) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground"
              >
                <span>{STATUS_LABELS[status] ?? status}</span>
                <span className="text-sm font-semibold text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <header>
            <h2 className="text-lg font-semibold text-foreground">Sesiones recientes</h2>
            <p className="text-sm text-muted-foreground">
              Últimos registros de asistencia y su estado.
            </p>
          </header>
          {recentSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay sesiones con asistencia registrada para este atleta.
            </p>
          ) : (
            <div className="space-y-3">
              {recentSessions.map((session) => (
                <div
                  key={`${session.sessionDate}-${session.classId}-${session.recordedAt?.toISOString?.() ?? session.recordedAt}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/30 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-foreground">{session.className ?? "Clase"}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.sessionDate} ·{" "}
                      {session.startTime && session.endTime
                        ? `${session.startTime} – ${session.endTime}`
                        : session.startTime
                        ? `Desde ${session.startTime}`
                        : "Horario no definido"}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                    {STATUS_LABELS[session.status] ?? session.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <header>
            <h2 className="text-lg font-semibold text-foreground">Contactos</h2>
            <p className="text-sm text-muted-foreground">
              Personas asociadas para notificaciones, permisos y seguimiento.
            </p>
          </header>

          <div className="space-y-3">
            {contacts.length === 0 && guardiansList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay contactos registrados para este atleta.
              </p>
            ) : (
              <>
                {contacts.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Familia / tutores</h3>
                    <ul className="space-y-2 text-sm">
                      {contacts.map((contact) => (
                        <li
                          key={contact.id}
                          className="rounded-md border border-border/60 bg-muted/30 px-3 py-2"
                        >
                          <p className="font-semibold text-foreground">
                            {contact.name}
                            {contact.relationship ? ` · ${contact.relationship}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {contact.email ?? "Sin correo"} · {contact.phone ?? "Sin teléfono"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Notificaciones:{" "}
                            {[
                              contact.notifyEmail ? "Email" : null,
                              contact.notifySms ? "SMS" : null,
                            ]
                              .filter(Boolean)
                              .join(" / ") || "No configuradas"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {guardiansList.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Guardianes</h3>
                    <ul className="space-y-2 text-sm">
                      {guardiansList.map((guardian) => (
                        <li
                          key={guardian.id}
                          className="rounded-md border border-border/60 bg-muted/30 px-3 py-2"
                        >
                          <p className="font-semibold text-foreground">
                            {guardian.name}
                            {guardian.isPrimary ? (
                              <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                                Principal
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {guardian.email ?? "Sin correo"} · {guardian.phone ?? "Sin teléfono"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {guardian.relationship ?? "Relación no especificada"}
                          </p>
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

      {/* Cuenta del atleta */}
      <section>
        <AthleteAccountSection academyId={academyId} athleteId={athleteId} />
      </section>

      {/* Clases base */}
      <section>
        <AthleteBaseClassesSection
          academyId={academyId}
          athleteId={athleteId}
          groupId={athleteRow.groupId}
          groupName={athleteRow.groupName}
        />
      </section>

      {/* Clases extra */}
      <section>
        <AthleteExtraClassesSection
          academyId={academyId}
          athleteId={athleteId}
          availableCoaches={availableCoaches.map((coach) => ({
            id: coach.id,
            name: coach.name ?? "Sin nombre",
            email: coach.email,
          }))}
        />
      </section>
    </div>
  );
}

