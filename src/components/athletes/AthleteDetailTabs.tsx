"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AthleteInfo {
  id: string;
  name: string;
  level: string | null;
  status: string | null;
  dob: Date | string | null;
  createdAt: Date | string | null;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
}

interface Contact {
  id: string;
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  notifyEmail: boolean | null;
  notifySms: boolean | null;
}

interface Guardian {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  relationship: string | null;
  isPrimary: boolean | null;
}

interface AttendanceSummary {
  status: string;
  total: number;
}

interface RecentSession {
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string | null;
  recordedAt: Date | string | null;
  className: string | null;
  classId: string;
}

interface AthleteDetailTabsProps {
  academyId: string;
  athlete: AthleteInfo;
  age: number | null;
  formattedDob: string | null;
  contacts: Contact[];
  guardians: Guardian[];
  attendanceSummary: AttendanceSummary[];
  recentSessions: RecentSession[];
  accountSection: React.ReactNode;
  classesSection: React.ReactNode;
}

const STATUS_LABELS: Record<string, string> = {
  present: "Presente",
  absent: "Ausente",
  late: "Tarde",
  excused: "Justificada",
};

export function AthleteDetailTabs({
  academyId,
  athlete,
  age,
  formattedDob,
  contacts,
  guardians,
  attendanceSummary,
  recentSessions,
  accountSection,
  classesSection,
}: AthleteDetailTabsProps) {
  const attendanceTotals = attendanceSummary.reduce(
    (accumulator, item) => ({
      ...accumulator,
      [item.status]: Number(item.total ?? 0),
    }),
    {} as Record<string, number>
  );

  const totalSessions = Object.values(attendanceTotals).reduce((sum, value) => sum + value, 0);

  const detailCardClass =
    "rounded-2xl border border-zaltyko-mist bg-white p-6 shadow-soft";
  const subtlePanelClass =
    "rounded-xl border border-zaltyko-mist/70 bg-zaltyko-warm-white px-4 py-3";

  return (
    <Tabs defaultValue="info" className="w-full">
      <TabsList className="mb-6 grid h-auto w-full grid-cols-2 p-1 sm:grid-cols-5">
        <TabsTrigger value="info" className="text-xs sm:text-sm">Info</TabsTrigger>
        <TabsTrigger value="attendance" className="text-xs sm:text-sm">Asistencia</TabsTrigger>
        <TabsTrigger value="classes" className="text-xs sm:text-sm">Clases</TabsTrigger>
        <TabsTrigger value="account" className="text-xs sm:text-sm">Cuenta</TabsTrigger>
        <TabsTrigger value="contacts" className="text-xs sm:text-sm">Contactos</TabsTrigger>
      </TabsList>

      <TabsContent value="info" className="space-y-4">
        <section className={detailCardClass}>
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-teal">Atleta</p>
              <h1 className="font-display text-3xl font-semibold text-zaltyko-navy">{athlete.name}</h1>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <span className="rounded-full bg-zaltyko-teal/10 px-3 py-1 font-medium text-zaltyko-teal">
                  Estado: {athlete.status}
                </span>
                {athlete.level && (
                  <span className="rounded-full bg-zaltyko-indigo/10 px-3 py-1 font-medium text-zaltyko-indigo">
                    Nivel: {athlete.level}
                  </span>
                )}
                {athlete.groupName && (
                  <span
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium"
                    style={
                      athlete.groupColor
                        ? {
                            borderColor: athlete.groupColor,
                            color: athlete.groupColor,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: athlete.groupColor ?? "currentColor" }}
                    />
                    {athlete.groupName}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right text-sm text-zaltyko-text-secondary">
              <p>
                Registrado el{" "}
                {athlete.createdAt
                  ? new Date(athlete.createdAt).toLocaleDateString("es-ES")
                  : "—"}
              </p>
              <p>Edad: {age ?? "No disponible"}</p>
              {formattedDob && <p>Nacido el {formattedDob}</p>}
            </div>
          </header>
        </section>

        <section className={detailCardClass}>
          <h2 className="font-display text-lg font-semibold text-zaltyko-navy">Resumen de asistencia</h2>
          <p className="text-sm text-zaltyko-text-secondary">
            Total de sesiones con registro: {totalSessions}
          </p>
          <div className="mt-4 grid gap-3">
            {Object.entries(attendanceTotals).map(([status, value]) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-xl border border-zaltyko-mist/70 bg-zaltyko-warm-white px-3 py-2 text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-text-secondary"
              >
                <span>{STATUS_LABELS[status] ?? status}</span>
                <span className="font-display text-base font-semibold text-zaltyko-navy">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </TabsContent>

      <TabsContent value="attendance" className="space-y-4">
        <section className={`${detailCardClass} space-y-4`}>
          <header>
            <h2 className="font-display text-lg font-semibold text-zaltyko-navy">Sesiones recientes</h2>
            <p className="text-sm text-zaltyko-text-secondary">
              Últimos registros de asistencia y su estado.
            </p>
          </header>
          {recentSessions.length === 0 ? (
            <p className="text-sm text-zaltyko-text-secondary">
              Todavía no hay sesiones con asistencia registrada para este atleta.
            </p>
          ) : (
            <div className="space-y-3">
              {recentSessions.map((session) => (
                <div
                  key={`${session.sessionDate}-${session.classId}-${session.recordedAt}`}
                  className={`${subtlePanelClass} flex flex-wrap items-center justify-between gap-3 text-sm`}
                >
                  <div>
                    <p className="font-semibold text-zaltyko-navy">{session.className ?? "Clase"}</p>
                    <p className="text-xs text-zaltyko-text-secondary">
                      {session.sessionDate} ·{" "}
                      {session.startTime && session.endTime
                        ? `${session.startTime} – ${session.endTime}`
                        : session.startTime
                        ? `Desde ${session.startTime}`
                        : "Horario no definido"}
                    </p>
                  </div>
                  <span className="rounded-full bg-zaltyko-teal/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.05em] text-zaltyko-teal">
                    {session.status ? STATUS_LABELS[session.status] ?? session.status : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </TabsContent>

      <TabsContent value="classes" className="space-y-4">
        {classesSection}
      </TabsContent>

      <TabsContent value="account" className="space-y-4">
        {accountSection}
      </TabsContent>

      <TabsContent value="contacts" className="space-y-4">
        <section className={`${detailCardClass} space-y-4`}>
          <header>
            <h2 className="font-display text-lg font-semibold text-zaltyko-navy">Contactos</h2>
            <p className="text-sm text-zaltyko-text-secondary">
              Personas asociadas para notificaciones, permisos y seguimiento.
            </p>
          </header>

          <div className="space-y-3">
            {contacts.length === 0 && guardians.length === 0 ? (
              <p className="text-sm text-zaltyko-text-secondary">
                No hay contactos registrados para este atleta.
              </p>
            ) : (
              <>
                {contacts.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-zaltyko-navy">Familia / tutores</h3>
                    <ul className="space-y-2 text-sm">
                      {contacts.map((contact) => (
                        <li
                          key={contact.id}
                          className={subtlePanelClass}
                        >
                          <p className="font-semibold text-zaltyko-navy">
                            {contact.name}
                            {contact.relationship ? ` · ${contact.relationship}` : ""}
                          </p>
                          <p className="text-xs text-zaltyko-text-secondary">
                            {contact.email ?? "Sin correo"} · {contact.phone ?? "Sin teléfono"}
                          </p>
                          <p className="text-[11px] text-zaltyko-text-secondary">
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

                {guardians.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-zaltyko-navy">Guardianes</h3>
                    <ul className="space-y-2 text-sm">
                      {guardians.map((guardian) => (
                        <li
                          key={guardian.id}
                          className={subtlePanelClass}
                        >
                          <p className="font-semibold text-zaltyko-navy">
                            {guardian.name}
                            {guardian.isPrimary ? (
                              <span className="ml-2 rounded-full bg-zaltyko-teal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-zaltyko-teal">
                                Principal
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-zaltyko-text-secondary">
                            {guardian.email ?? "Sin correo"} · {guardian.phone ?? "Sin teléfono"}
                          </p>
                          <p className="text-[11px] text-zaltyko-text-secondary">
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
        </section>
      </TabsContent>
    </Tabs>
  );
}
