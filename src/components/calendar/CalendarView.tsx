"use client";

import { addDays, addMonths, format, isSameDay, isSameMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SessionEntry = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  classId: string | null;
  className: string | null;
  academyName: string | null;
  coachName: string | null;
  targetUrl?: string;
  isPlaceholder?: boolean;
  isExtra?: boolean;
};

interface CalendarViewProps {
  view: "week" | "month";
  referenceDate: string;
  rangeStart: string;
  rangeEnd: string;
  sessions: SessionEntry[];
}

const statusColors: Record<string, string> = {
  scheduled: "bg-zaltyko-primary/15 text-zaltyko-primary",
  completed: "bg-zaltyko-primary-light/15 text-zaltyko-primary-light",
  cancelled: "bg-red-500/15 text-red-700",
  placeholder: "border border-dashed border-amber-400 bg-amber-50 text-amber-900",
};

function getStatusColor(status: string) {
  return statusColors[status] ?? "bg-muted text-muted-foreground";
}

function getWeekDays(startIso: string): Date[] {
  const start = parseISO(startIso);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function getMonthMatrix(referenceIso: string): Date[][] {
  const reference = parseISO(referenceIso);
  const startOfMonth = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const firstDay = startOfMonth.getDay() === 0 ? 6 : startOfMonth.getDay() - 1;
  const start = addDays(startOfMonth, -firstDay);

  const matrix: Date[][] = [];

  let current = start;
  for (let week = 0; week < 6; week += 1) {
    const days = Array.from({ length: 7 }, () => {
      const day = current;
      current = addDays(current, 1);
      return day;
    });
    matrix.push(days);
  }

  return matrix;
}

export default function CalendarView({
  view,
  referenceDate,
  rangeStart,
  rangeEnd,
  sessions,
}: CalendarViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentView, setCurrentView] = useState<"week" | "month">(view);

  useEffect(() => {
    setCurrentView(view);
  }, [view]);

  const reference = useMemo(() => parseISO(referenceDate), [referenceDate]);

  const updateUrl = (nextView: "week" | "month", nextDate: Date) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("view", nextView);
    params.set("date", nextDate.toISOString().slice(0, 10));
    router.push(`${pathname}?${params.toString()}`);
  };

  const weekDays = useMemo(() => getWeekDays(rangeStart), [rangeStart]);
  const monthMatrix = useMemo(
    () => getMonthMatrix(referenceDate),
    [referenceDate]
  );

  const sessionsByDate = useMemo(() => {
    return sessions.reduce<Record<string, SessionEntry[]>>((acc, session) => {
      const key = session.date;
      if (!acc[key]) acc[key] = [];
      acc[key].push(session);
      return acc;
    }, {});
  }, [sessions]);

  const toggleView = (mode: "week" | "month") => {
    if (mode === currentView) {
      return;
    }
    setCurrentView(mode);
    updateUrl(mode, reference);
  };

  const handleNavigate = (direction: number) => {
    const target =
      currentView === "week"
        ? addDays(reference, direction * 7)
        : addMonths(reference, direction);
    updateUrl(currentView, target);
  };

  const handleResetToday = () => {
    updateUrl(currentView, new Date());
  };

  const BaseControls = () => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => toggleView("week")}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            currentView === "week"
              ? "bg-emerald-500 text-white"
              : "bg-muted text-muted-foreground"
          }`}
        >
          Semana
        </button>
        <button
          type="button"
          onClick={() => toggleView("month")}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            currentView === "month"
              ? "bg-emerald-500 text-white"
              : "bg-muted text-muted-foreground"
          }`}
        >
          Mes
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleNavigate(-1)}
            className="rounded-md border border-border bg-background px-3 py-1 text-sm hover:bg-muted"
          >
            {currentView === "week" ? "Semana anterior" : "Mes anterior"}
          </button>
          <button
            type="button"
            onClick={handleResetToday}
            className="rounded-md border border-border bg-background px-3 py-1 text-sm hover:bg-muted"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => handleNavigate(1)}
            className="rounded-md border border-border bg-background px-3 py-1 text-sm hover:bg-muted"
          >
            {currentView === "week" ? "Semana siguiente" : "Mes siguiente"}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Mostrando del {format(parseISO(rangeStart), "d MMM", { locale: es })} al{" "}
          {format(parseISO(rangeEnd), "d MMM yyyy", { locale: es })}
        </p>
      </div>
    </div>
  );

  const renderSessionChip = (session: SessionEntry) => {
    const content = (
      <>
        <p className="font-medium">
          {session.className ?? "Clase sin nombre"}
        </p>
        <p>
          {session.startTime ?? "—"}
          {session.endTime ? ` · ${session.endTime}` : ""}
        </p>
        <p className="text-[10px]">
          {session.coachName ?? "Sin entrenador"}
        </p>
        {session.isPlaceholder && (
          <p className="text-[10px] font-semibold uppercase text-amber-700">
            Sesión no generada
          </p>
        )}
      </>
    );

    // Color según tipo de clase: azul para base, amarillo para extra
    const baseColorClass = session.isExtra
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : "bg-blue-100 text-blue-800 border-blue-200";
    
    const className = `block rounded-md border px-2 py-1 text-xs ${baseColorClass} ${getStatusColor(
      session.status
    )}`;

    if (session.targetUrl) {
      return (
        <Link key={session.id} href={session.targetUrl} className={className}>
          {content}
        </Link>
      );
    }

    return (
      <div key={session.id} className={className}>
        {content}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <BaseControls />

      {currentView === "week" ? (
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-7">
          {weekDays.map((day) => {
            const iso = day.toISOString().slice(0, 10);
            const daySessions = sessionsByDate[iso] ?? [];
            return (
              <div key={iso} className="flex flex-col bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs uppercase text-muted-foreground">
                    {format(day, "EEE", { locale: es })}
                  </span>
                  <span className="text-sm font-semibold">
                    {format(day, "d", { locale: es })}
                  </span>
                </div>
                <div className="space-y-2">
                  {daySessions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin sesiones</p>
                  ) : (
                    daySessions.map((session) => renderSessionChip(session))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-7">
          {monthMatrix.map((week, weekIndex) =>
            week.map((day) => {
              const iso = day.toISOString().slice(0, 10);
              const daySessions = sessionsByDate[iso] ?? [];
              const isCurrentMonth = isSameMonth(day, parseISO(referenceDate));
              return (
                <div
                  key={`${weekIndex}-${iso}`}
                  className={`flex min-h-[140px] flex-col bg-card p-3 ${
                    isCurrentMonth ? "" : "opacity-60"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs uppercase text-muted-foreground">
                      {format(day, "EEE", { locale: es })}
                    </span>
                    <span className="text-sm font-semibold">
                      {format(day, "d", { locale: es })}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {daySessions.slice(0, 3).map((session) =>
                      renderSessionChip(session)
                    )}
                    {daySessions.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">
                        +{daySessions.length - 3} sesiones
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}


