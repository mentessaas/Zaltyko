"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AttendanceDialog } from "@/components/classes/AttendanceDialog";
import { CreateSessionDialog } from "@/components/classes/CreateSessionDialog";
import { GenerateSessionsDialog } from "@/components/classes/GenerateSessionsDialog";

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

interface CoachOption {
  id: string;
  name: string;
  email: string | null;
}

interface ClassInfo {
  id: string;
  academyId: string;
  name: string;
  weekday: number | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  coaches: CoachOption[];
}

interface SessionItem {
  id: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string | null;
  notes: string | null;
  coachId: string | null;
  coachName: string | null;
  attendanceSummary: {
    total: number;
    present: number;
  };
}

interface AthleteOption {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
}

interface ClassDetailViewProps {
  classInfo: ClassInfo;
  sessions: SessionItem[];
  athleteOptions: AthleteOption[];
  coachOptions: CoachOption[];
}

export function ClassDetailView({
  classInfo,
  sessions,
  athleteOptions,
  coachOptions,
}: ClassDetailViewProps) {
  const router = useRouter();
  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [generateSessionsOpen, setGenerateSessionsOpen] = useState(false);
  const [attendanceSessionId, setAttendanceSessionId] = useState<string | null>(null);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const refresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const formatSchedule = () => {
    const day =
      classInfo.weekday !== null && classInfo.weekday !== undefined
        ? WEEKDAY_LABELS[classInfo.weekday]
        : "Día variable";
    const time =
      classInfo.startTime && classInfo.endTime
        ? `${classInfo.startTime} – ${classInfo.endTime}`
        : classInfo.startTime
        ? `Desde ${classInfo.startTime}`
        : "Horario flexible";
    return `${day} · ${time}`;
  };

  const handleOpenAttendance = (sessionId: string) => {
    setAttendanceSessionId(sessionId);
    setAttendanceOpen(true);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Clase</p>
            <h1 className="text-3xl font-semibold">{classInfo.name}</h1>
            <p className="text-sm text-muted-foreground">{formatSchedule()}</p>
            <p className="text-xs text-muted-foreground">
              Capacidad objetivo: {classInfo.capacity ?? "No definida"}
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {classInfo.coaches.length === 0 ? (
                <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                  Sin entrenadores asignados
                </span>
              ) : (
                classInfo.coaches.map((coach) => (
                  <span
                    key={coach.id}
                    className="rounded-full bg-primary/10 px-3 py-1 text-primary"
                  >
                    {coach.name}
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/app/${classInfo.academyId}/classes`}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Volver a clases
            </Link>
            {classInfo.weekday !== null && classInfo.weekday !== undefined && (
              <button
                type="button"
                onClick={() => setGenerateSessionsOpen(true)}
                className="inline-flex items-center justify-center rounded-md border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRefreshing}
              >
                Generar sesiones
              </button>
            )}
            <button
              type="button"
              onClick={() => setCreateSessionOpen(true)}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isRefreshing}
            >
              Programar sesión
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sesiones recientes</h2>
          <p className="text-xs text-muted-foreground">
            Haz clic en “Registrar asistencia” para actualizar el estado de los atletas.
          </p>
        </header>

        <div className="overflow-hidden rounded-lg border bg-card shadow">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Horario</th>
                <th className="px-4 py-3 font-medium">Coach</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Asistencia</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background text-foreground">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Todavía no hay sesiones registradas.
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">
                      {session.sessionDate}
                      {session.notes && (
                        <p className="text-xs text-muted-foreground">{session.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {session.startTime && session.endTime
                        ? `${session.startTime} – ${session.endTime}`
                        : session.startTime
                        ? `Desde ${session.startTime}`
                        : "Sin horario"}
                    </td>
                    <td className="px-4 py-3">{session.coachName ?? "Sin asignar"}</td>
                    <td className="px-4 py-3 capitalize">
                      {session.status ?? "sin estado"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {session.attendanceSummary.present}/{session.attendanceSummary.total} presentes
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenAttendance(session.id)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Registrar asistencia
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CreateSessionDialog
        classId={classInfo.id}
        academyId={classInfo.academyId}
        coaches={coachOptions}
        open={createSessionOpen}
        onClose={() => setCreateSessionOpen(false)}
        onCreated={refresh}
      />

      <GenerateSessionsDialog
        classId={classInfo.id}
        className={classInfo.name}
        weekday={classInfo.weekday}
        startTime={classInfo.startTime}
        endTime={classInfo.endTime}
        open={generateSessionsOpen}
        onClose={() => setGenerateSessionsOpen(false)}
        onGenerated={refresh}
      />

      <AttendanceDialog
        sessionId={attendanceSessionId}
        open={attendanceOpen}
        onClose={() => setAttendanceOpen(false)}
        onSaved={refresh}
        athletes={athleteOptions}
      />
    </div>
  );
}


