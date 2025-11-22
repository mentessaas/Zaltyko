"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface CoachTodayViewProps {
  coach: {
    id: string;
    name: string | null;
    email: string | null;
  };
  academy: {
    id: string;
    name: string | null;
  };
  todaySessions: Array<{
    id: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    status: string | null;
    notes: string | null;
    classId: string;
    className: string;
    isExtra: boolean;
  }>;
  allClasses: Array<{
    id: string;
    name: string;
    type: "base" | "extra";
    startTime: string | null;
    endTime: string | null;
    weekdays: number[];
    groupName: string | null;
  }>;
  today: string;
}

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

export default function CoachTodayView({
  coach,
  academy,
  todaySessions,
  allClasses,
  today,
}: CoachTodayViewProps) {
  const todayDate = parseISO(today);
  const todayWeekday = todayDate.getDay();

  // Filtrar clases que ocurren hoy
  const classesToday = allClasses.filter((cls) => cls.weekdays.includes(todayWeekday));

  // Ordenar sesiones y clases por hora
  const sortedSessions = [...todaySessions].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  const sortedClasses = [...classesToday].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  // Detectar conflictos (solo visible para admin, pero aquí mostramos todas las clases)
  const hasConflicts = sortedSessions.some((session, index) => {
    if (!session.startTime || !session.endTime) return false;
    for (let i = index + 1; i < sortedSessions.length; i++) {
      const next = sortedSessions[i];
      if (!next.startTime || !next.endTime) continue;
      // Verificar solapamiento
      if (session.startTime < next.endTime && session.endTime > next.startTime) {
        return true;
      }
    }
    return false;
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Vista diaria del entrenador</h1>
        <p className="text-muted-foreground">
          {format(todayDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
        </p>
        <p className="text-sm text-muted-foreground">
          {academy.name} · {coach.name ?? "Entrenador"}
        </p>
      </header>

      {hasConflicts && (
        <div className="rounded-lg border border-yellow-400 bg-yellow-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <p className="text-sm font-semibold text-yellow-900">
              Advertencia: Se detectaron posibles conflictos de horario en las sesiones de hoy.
            </p>
          </div>
        </div>
      )}

      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h2 className="text-lg font-semibold">Sesiones programadas para hoy</h2>
          <p className="text-sm text-muted-foreground">
            Sesiones específicas programadas para el día de hoy.
          </p>
        </header>

        {sortedSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay sesiones programadas para hoy.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedSessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between rounded-md border px-4 py-3 ${
                  session.isExtra
                    ? "border-yellow-200 bg-yellow-50"
                    : "border-blue-200 bg-blue-50"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">{session.className}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        session.isExtra
                          ? "bg-yellow-200 text-yellow-800"
                          : "bg-blue-200 text-blue-800"
                      }`}
                    >
                      {session.isExtra ? "Extra" : "Base"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {session.startTime && session.endTime
                      ? `${session.startTime} – ${session.endTime}`
                      : session.startTime
                      ? `Desde ${session.startTime}`
                      : "Horario no definido"}
                  </p>
                  {session.notes && (
                    <p className="mt-1 text-xs text-muted-foreground">{session.notes}</p>
                  )}
                  {session.status && (
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      Estado: {session.status}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/app/${academy.id}/classes/${session.classId}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Ver clase
                  </Link>
                  <Link
                    href={`/dashboard/sessions/${session.id}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Ver sesión
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h2 className="text-lg font-semibold">Todas tus clases</h2>
          <p className="text-sm text-muted-foreground">
            Clases base y extra asignadas a ti. Incluye clases recurrentes que ocurren hoy.
          </p>
        </header>

        {sortedClasses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tienes clases asignadas que ocurran hoy.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedClasses.map((cls) => (
              <div
                key={cls.id}
                className={`flex items-center justify-between rounded-md border px-4 py-3 ${
                  cls.type === "extra"
                    ? "border-yellow-200 bg-yellow-50"
                    : "border-blue-200 bg-blue-50"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">{cls.name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        cls.type === "extra"
                          ? "bg-yellow-200 text-yellow-800"
                          : "bg-blue-200 text-blue-800"
                      }`}
                    >
                      {cls.type === "extra" ? "Extra" : "Base"}
                    </span>
                    {cls.groupName && (
                      <span className="text-xs text-muted-foreground">
                        Grupo: {cls.groupName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cls.weekdays
                      .map((day) => WEEKDAY_LABELS[day] ?? `Día ${day}`)
                      .join(", ")}{" "}
                    ·{" "}
                    {cls.startTime && cls.endTime
                      ? `${cls.startTime} – ${cls.endTime}`
                      : cls.startTime
                      ? `Desde ${cls.startTime}`
                      : "Horario flexible"}
                  </p>
                </div>
                <Link
                  href={`/app/${academy.id}/classes/${cls.id}`}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Ver clase
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

