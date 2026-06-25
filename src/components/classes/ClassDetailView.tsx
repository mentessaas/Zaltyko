"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AttendanceDialog } from "@/components/classes/AttendanceDialog";
import { CreateSessionDialog } from "@/components/classes/CreateSessionDialog";
import { GenerateSessionsDialog } from "@/components/classes/GenerateSessionsDialog";
import { AddAthleteToClassDialog } from "@/components/classes/AddAthleteToClassDialog";
import { ClassExceptionsDialog } from "@/components/classes/ClassExceptionsDialog";
import { useToast } from "@/components/ui/toast-provider";
import { createClient } from "@/lib/supabase/client";
import type { SportConfigOption } from "@/components/groups/types";
import { getTerminology } from "@/lib/sport-config/terminology";

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
  sportConfigIds?: string[];
}

interface ClassInfo {
  id: string;
  academyId: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  technicalFocus: string | null;
  apparatus: string[];
  sportConfigId: string | null;
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
  sportConfigId: string | null;
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
  primarySportConfigId?: string | null;
  groupSportConfigId?: string | null;
}

interface ClassAthlete {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  primarySportConfigId: string | null;
  groupSportConfigId: string | null;
  origin: "group" | "enrollment";
  enrollmentId?: string;
}

interface ClassDetailViewProps {
  classInfo: ClassInfo;
  sessions: SessionItem[];
  classAthletes: ClassAthlete[];
  athleteOptions: AthleteOption[];
  coachOptions: CoachOption[];
  sportConfigs?: SportConfigOption[];
}

export function ClassDetailView({
  classInfo,
  sessions,
  classAthletes,
  athleteOptions,
  coachOptions,
  sportConfigs = [],
}: ClassDetailViewProps) {
  const router = useRouter();
  const toast = useToast();
  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [generateSessionsOpen, setGenerateSessionsOpen] = useState(false);
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [attendanceSessionId, setAttendanceSessionId] = useState<string | null>(null);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [addAthleteOpen, setAddAthleteOpen] = useState(false);
  const [removingEnrollmentId, setRemovingEnrollmentId] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();
  const selectedSportConfig = sportConfigs.find((config) => config.id === classInfo.sportConfigId) ?? null;
  const terms = getTerminology(selectedSportConfig);
  const classTerm = "Clase";
  const classTermLower = classTerm.toLowerCase();
  const athleteTermLower = terms.athlete.toLowerCase();
  const athleteTermPlural = terms.athletes;
  const athleteTermPluralLower = athleteTermPlural.toLowerCase();
  const groupTermLower = terms.group.toLowerCase();
  const attendanceTermLower = terms.attendance.toLowerCase();

  const refresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const formatSchedule = () => {
    const dayLabel =
      classInfo.weekdays.length > 0
        ? classInfo.weekdays.map((day) => WEEKDAY_LABELS[day] ?? `Día ${day}`).join(", ")
        : "Día variable";
    const time =
      classInfo.startTime && classInfo.endTime
        ? `${classInfo.startTime} – ${classInfo.endTime}`
        : classInfo.startTime
          ? `Desde ${classInfo.startTime}`
          : "Horario flexible";
    return `${dayLabel} · ${time}`;
  };

  const handleOpenAttendance = (sessionId: string) => {
    setAttendanceSessionId(sessionId);
    setAttendanceOpen(true);
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    if (!window.confirm(`¿Quitar este ${athleteTermLower} de la ${classTermLower}? Esto solo elimina la inscripción extra, no afecta su ${groupTermLower} principal.`)) {
      return;
    }

    setRemovingEnrollmentId(enrollmentId);
    try {
      const supabase = createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const headers: Record<string, string> = {
        "x-academy-id": classInfo.academyId,
      };

      if (currentUser?.id) {
      }

      const response = await fetch(`/api/class-enrollments/${enrollmentId}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `No se pudo quitar el ${athleteTermLower} de la ${classTermLower}.`);
      }

      toast.pushToast({
        title: `${terms.athlete} quitado`,
        description: `El ${athleteTermLower} ha sido quitado de la ${classTermLower}.`,
        variant: "success",
      });

      refresh();
    } catch (err: unknown) {
      toast.pushToast({
        title: "Error",
        description: (err instanceof Error ? err.message : "Error desconocido") ?? `Error al quitar el ${athleteTermLower} de la ${classTermLower}.`,
        variant: "error",
      });
    } finally {
      setRemovingEnrollmentId(null);
    }
  };

  const outlineButtonClass =
    "inline-flex min-h-11 items-center justify-center rounded-xl border border-zaltyko-indigo px-4 py-2 text-sm font-medium text-zaltyko-indigo transition hover:bg-zaltyko-indigo/5";
  const primaryButtonClass =
    "inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60";
  const subtlePanelClass =
    "rounded-xl border border-zaltyko-mist/70 bg-zaltyko-warm-white";

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-zaltyko-mist bg-white p-6 shadow-soft">
        <div className="zaltyko-motion-lines pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70" />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="relative space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-teal">{classTerm}</p>
            <h1 className="font-display text-3xl font-semibold text-zaltyko-navy">{classInfo.name}</h1>
            <p className="text-sm text-zaltyko-text-secondary">{formatSchedule()}</p>
            <p className="text-xs text-zaltyko-text-secondary">
              Capacidad objetivo: {classInfo.capacity ?? "No definida"}
            </p>
            {classInfo.technicalFocus && (
              <p className="max-w-3xl text-sm text-zaltyko-text-secondary">{classInfo.technicalFocus}</p>
            )}
            {classInfo.apparatus.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {classInfo.apparatus.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-zaltyko-teal/20 bg-zaltyko-teal/10 px-3 py-1 font-semibold text-zaltyko-teal"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              {classInfo.coaches.length === 0 ? (
                <span className="rounded-full bg-zaltyko-mist/30 px-3 py-1 text-zaltyko-text-secondary">
                  Sin {terms.coach.toLowerCase()}s asignados
                </span>
              ) : (
                classInfo.coaches.map((coach) => (
                  <span
                    key={coach.id}
                    className="rounded-full bg-zaltyko-indigo/10 px-3 py-1 font-medium text-zaltyko-indigo"
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
              className={outlineButtonClass}
            >
              Volver a {classTermLower}s
            </Link>
            {classInfo.weekdays.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setExceptionsOpen(true)}
                  className={outlineButtonClass}
                >
                  Excepciones
                </button>
                <button
                  type="button"
                  onClick={() => setGenerateSessionsOpen(true)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zaltyko-teal/25 bg-zaltyko-teal/10 px-4 py-2 text-sm font-semibold text-zaltyko-teal transition hover:bg-zaltyko-teal/15 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isRefreshing}
                >
                  Generar sesiones
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setCreateSessionOpen(true)}
              className={primaryButtonClass}
              disabled={isRefreshing}
            >
              Programar sesión
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-display text-xl font-semibold text-zaltyko-navy">Sesiones recientes</h2>
          <p className="text-xs text-zaltyko-text-secondary">
            Haz clic en “Registrar {attendanceTermLower}” para actualizar el estado de los {athleteTermPluralLower}.
          </p>
        </header>

        <div className="overflow-x-auto rounded-2xl border border-zaltyko-mist bg-white shadow-soft">
          <table className="min-w-full divide-y divide-zaltyko-mist text-sm">
            <thead className="bg-zaltyko-warm-white">
              <tr className="text-left text-xs uppercase tracking-[0.05em] text-zaltyko-text-secondary">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Horario</th>
                <th className="px-4 py-3 font-medium">{terms.coach}</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">{terms.attendance}</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-zaltyko-navy">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zaltyko-text-secondary">
                    Todavía no hay sesiones registradas.
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id} className="transition hover:bg-zaltyko-warm-white/80">
                    <td className="px-4 py-3 font-medium">
                      {session.sessionDate}
                      {session.notes && (
                        <p className="text-xs text-zaltyko-text-secondary">{session.notes}</p>
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
                        className="text-xs font-semibold text-zaltyko-teal hover:underline"
                      >
                        Registrar {attendanceTermLower}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-zaltyko-mist bg-white p-6 shadow-soft">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-zaltyko-navy">{athleteTermPlural} de esta {classTermLower}</h2>
            <p className="text-xs text-zaltyko-text-secondary">
              Lista de {athleteTermPluralLower} que participan en esta {classTermLower}. Incluye {athleteTermPluralLower} del {groupTermLower} base y extras añadidos manualmente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddAthleteOpen(true)}
            className={primaryButtonClass}
          >
            Añadir {athleteTermLower} extra
          </button>
        </header>

        {classAthletes.length === 0 ? (
          <p className="text-sm text-zaltyko-text-secondary">
            No hay {athleteTermPluralLower} asignados a esta {classTermLower}. Añade {groupTermLower}s a la {classTermLower} o {athleteTermPluralLower} extra manualmente.
          </p>
        ) : (
          <div className="space-y-2">
            {classAthletes.map((athlete) => (
              <div
                key={athlete.id}
                className={`${subtlePanelClass} flex items-center justify-between px-4 py-3`}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-semibold text-zaltyko-navy">{athlete.name}</p>
                    {athlete.groupName && (
                      <p className="text-xs text-zaltyko-text-secondary">
                        {terms.group} principal: {athlete.groupName}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${athlete.origin === "group"
                        ? "bg-zaltyko-indigo/10 text-zaltyko-indigo"
                        : "bg-zaltyko-coral/10 text-zaltyko-coral"
                      }`}
                  >
                    {athlete.origin === "group" ? `Por ${groupTermLower}` : `${classTerm} extra`}
                  </span>
                  {athlete.origin === "enrollment" && athlete.enrollmentId && (
                    <button
                      type="button"
                      onClick={() => handleRemoveEnrollment(athlete.enrollmentId!)}
                      disabled={removingEnrollmentId === athlete.enrollmentId}
                      className="text-xs font-semibold text-zaltyko-coral hover:underline disabled:opacity-50"
                    >
                      {removingEnrollmentId === athlete.enrollmentId ? "Eliminando..." : "Quitar"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <CreateSessionDialog
        classId={classInfo.id}
        academyId={classInfo.academyId}
        coaches={coachOptions}
        sportConfigId={classInfo.sportConfigId}
        sportConfigs={sportConfigs}
        open={createSessionOpen}
        onClose={() => setCreateSessionOpen(false)}
        onCreated={refresh}
      />

      <GenerateSessionsDialog
        classId={classInfo.id}
        className={classInfo.name}
        weekdays={classInfo.weekdays}
        startTime={classInfo.startTime}
        endTime={classInfo.endTime}
        open={generateSessionsOpen}
        onClose={() => setGenerateSessionsOpen(false)}
        onGenerated={refresh}
      />

      <ClassExceptionsDialog
        classId={classInfo.id}
        open={exceptionsOpen}
        onClose={() => setExceptionsOpen(false)}
      />

      <AttendanceDialog
        sessionId={attendanceSessionId}
        open={attendanceOpen}
        onClose={() => setAttendanceOpen(false)}
        onSaved={refresh}
        athletes={classAthletes.map((a) => ({
          id: a.id,
          name: a.name,
          groupId: a.groupId,
          groupName: a.groupName,
          groupColor: a.groupColor,
          primarySportConfigId: a.primarySportConfigId,
          groupSportConfigId: a.groupSportConfigId,
        }))}
        sportConfigs={sportConfigs}
      />

      <AddAthleteToClassDialog
        classId={classInfo.id}
        academyId={classInfo.academyId}
        open={addAthleteOpen}
        onClose={() => setAddAthleteOpen(false)}
        onAdded={refresh}
        athletes={athleteOptions}
        existingAthleteIds={classAthletes.map((a) => a.id)}
        athleteLabel={terms.athlete}
        athletesLabel={terms.athletes}
        groupLabel={terms.group}
        classLabel={classTerm}
      />
    </div>
  );
}
