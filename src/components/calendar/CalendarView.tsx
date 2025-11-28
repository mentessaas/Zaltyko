"use client";

import { addDays, addMonths, isSameDay, isSameMonth, parseISO, isToday } from "date-fns";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDateForCountry, formatTimeForCountry, formatDateToISOString, getNowInCountryTimezone, isTodayInCountryTimezone, convertToCountryTimezone } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, AlertCircle, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgendaView } from "@/components/calendar/AgendaView";

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
  view: "week" | "month" | "agenda";
  referenceDate: string;
  rangeStart: string;
  rangeEnd: string;
  sessions: SessionEntry[];
  academyCountry?: string | null;
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

function getWeekDays(startIso: string, countryCode?: string | null): Date[] {
  // startIso viene como 'YYYY-MM-DD' desde el servidor
  // parseISO lo interpreta como UTC medianoche, pero necesitamos trabajar con la fecha local
  // Crear la fecha directamente sin parseISO para evitar problemas de zona horaria
  const [year, month, day] = startIso.split('-').map(Number);
  const start = new Date(year, month - 1, day); // month es 0-indexed en Date
  // Los días ya vienen calculados correctamente desde el servidor con la zona horaria del país
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function getMonthMatrix(referenceIso: string, countryCode?: string | null): Date[][] {
  // referenceIso viene como 'YYYY-MM-DD' desde el servidor
  // Crear la fecha directamente sin parseISO para evitar problemas de zona horaria
  const [year, month] = referenceIso.split('-').map(Number);
  const reference = new Date(year, month - 1, 1); // month es 0-indexed en Date
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
  academyCountry,
}: CalendarViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentView, setCurrentView] = useState<"week" | "month" | "agenda">(view);

  useEffect(() => {
    setCurrentView(view);
  }, [view]);

  // referenceDate viene como 'YYYY-MM-DD', crear Date directamente
  const reference = useMemo(() => {
    const [year, month, day] = referenceDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  }, [referenceDate]);

  const updateUrl = (nextView: "week" | "month" | "agenda", nextDate: Date) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("view", nextView);
    // Usar formatDateToISOString para respetar la zona horaria del país
    params.set("date", formatDateToISOString(nextDate, academyCountry));
    router.push(`${pathname}?${params.toString()}`);
  };

  const weekDays = useMemo(() => getWeekDays(rangeStart, academyCountry), [rangeStart, academyCountry]);
  const monthMatrix = useMemo(
    () => getMonthMatrix(referenceDate, academyCountry),
    [referenceDate, academyCountry]
  );

  const sessionsByDate = useMemo(() => {
    return sessions.reduce<Record<string, SessionEntry[]>>((acc, session) => {
      const key = session.date;
      if (!acc[key]) acc[key] = [];
      acc[key].push(session);
      return acc;
    }, {});
  }, [sessions]);

  const toggleView = (mode: "week" | "month" | "agenda") => {
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
    const today = academyCountry ? getNowInCountryTimezone(academyCountry) : new Date();
    updateUrl(currentView, today);
  };

  const BaseControls = () => {
    const today = academyCountry ? getNowInCountryTimezone(academyCountry) : new Date();
    const isCurrentPeriod = useMemo(() => {
      if (currentView === "week") {
        const weekStart = parseISO(rangeStart);
        const weekEnd = parseISO(rangeEnd);
        return today >= weekStart && today <= weekEnd;
      } else {
        const monthStart = parseISO(rangeStart);
        const monthEnd = parseISO(rangeEnd);
        return today >= monthStart && today <= monthEnd;
      }
    }, [currentView, rangeStart, rangeEnd, today, academyCountry]);

    return (
      <div className="space-y-4">
        {/* Controles principales */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Selector de vista */}
          <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
            <button
              type="button"
              onClick={() => toggleView("week")}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
                currentView === "week"
                  ? "bg-zaltyko-primary text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <CalendarIcon className="h-4 w-4" />
              Semana
            </button>
            <button
              type="button"
              onClick={() => toggleView("month")}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
                currentView === "month"
                  ? "bg-zaltyko-primary text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <CalendarIcon className="h-4 w-4" />
              Mes
            </button>
            <button
              type="button"
              onClick={() => toggleView("agenda")}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
                currentView === "agenda"
                  ? "bg-zaltyko-primary text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <List className="h-4 w-4" />
              Agenda
            </button>
          </div>

          {/* Navegación */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleNavigate(-1)}
              className="h-9"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">
                {currentView === "week" ? "Semana anterior" : "Mes anterior"}
              </span>
            </Button>
            <Button
              variant={isCurrentPeriod ? "secondary" : "outline"}
              size="sm"
              onClick={handleResetToday}
              className="h-9"
            >
              Hoy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleNavigate(1)}
              className="h-9"
            >
              <span className="hidden sm:inline">
                {currentView === "week" ? "Semana siguiente" : "Mes siguiente"}
              </span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Rango de fechas */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarIcon className="h-4 w-4" />
          <span className="font-medium">
            {formatDateForCountry(parseISO(rangeStart), academyCountry, "d MMM")} -{" "}
            {formatDateForCountry(parseISO(rangeEnd), academyCountry, "d MMM yyyy")}
          </span>
        </div>
      </div>
    );
  };

  const renderSessionChip = (session: SessionEntry, isCompact: boolean = false) => {
    const sessionDate = parseISO(session.date);
    const isSessionToday = isTodayInCountryTimezone(sessionDate, academyCountry);

    const baseStyles = cn(
      "group relative flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-xs transition-all",
      "hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
      session.isPlaceholder
        ? "border-dashed border-amber-300 bg-amber-50/80 text-amber-900"
        : session.isExtra
          ? "border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100/50 text-yellow-900"
          : "border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-900",
      isSessionToday && "ring-2 ring-zaltyko-primary/30 ring-offset-1",
      getStatusColor(session.status)
    );

    const content = (
      <>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-tight line-clamp-1">
            {session.className ?? "Clase sin nombre"}
          </p>
          {session.isPlaceholder && (
            <AlertCircle className="h-3 w-3 shrink-0 text-amber-600" />
          )}
        </div>
        {session.startTime && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {formatTimeForCountry(session.date + "T" + session.startTime, academyCountry)}
              {session.endTime &&
                ` - ${formatTimeForCountry(session.date + "T" + session.endTime, academyCountry)}`}
            </span>
          </div>
        )}
        {session.coachName && !isCompact && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="line-clamp-1">{session.coachName}</span>
          </div>
        )}
        {session.isPlaceholder && (
          <div className="mt-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
            No generada
          </div>
        )}
      </>
    );

    if (session.targetUrl) {
      return (
        <Link
          key={session.id}
          href={session.targetUrl}
          className={baseStyles}
        >
          {content}
        </Link>
      );
    }

    return (
      <div key={session.id} className={baseStyles}>
        {content}
      </div>
    );
  };

  const today = academyCountry ? getNowInCountryTimezone(academyCountry) : new Date();

  return (
    <div className="space-y-6">
      <BaseControls />

      {currentView === "agenda" ? (
        <AgendaView
          sessions={sessions}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
        />
      ) : currentView === "week" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-7">
            {weekDays.map((day) => {
              const iso = formatDateToISOString(day, academyCountry);
              const daySessions = sessionsByDate[iso] ?? [];
              const isDayToday = isTodayInCountryTimezone(day, academyCountry);
              // Usar la zona horaria del país para determinar el día de la semana
              const zonedDay = academyCountry ? convertToCountryTimezone(day, academyCountry) : day;
              const isWeekend = zonedDay.getDay() === 0 || zonedDay.getDay() === 6;

              return (
                <div
                  key={iso}
                  className={cn(
                    "flex min-h-[200px] flex-col bg-card p-4 transition-colors",
                    isDayToday && "bg-gradient-to-br from-zaltyko-primary/5 to-transparent",
                    isWeekend && "bg-muted/30"
                  )}
                >
                  {/* Header del día */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {formatDateForCountry(day, academyCountry, "EEE")}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-lg font-bold",
                            isDayToday && "text-zaltyko-primary"
                          )}
                        >
                          {formatDateForCountry(day, academyCountry, "d")}
                        </span>
                        {isDayToday && (
                          <span className="rounded-full bg-zaltyko-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                            Hoy
                          </span>
                        )}
                      </div>
                    </div>
                    {daySessions.length > 0 && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zaltyko-primary/10 text-xs font-semibold text-zaltyko-primary">
                        {daySessions.length}
                      </span>
                    )}
                  </div>

                  {/* Sesiones */}
                  <div className="flex-1 space-y-2">
                    {daySessions.length === 0 ? (
                      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/20 py-8">
                        <p className="text-xs text-muted-foreground">Sin sesiones</p>
                      </div>
                    ) : (
                      daySessions.map((session) => renderSessionChip(session, false))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {/* Encabezados de días de la semana */}
          <div className="grid grid-cols-7 gap-px border-b border-border bg-border">
            {["L", "M", "X", "J", "V", "S", "D"].map((day, index) => (
              <div
                key={index}
                className="bg-muted/50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grid del mes */}
          <div className="grid grid-cols-7 gap-px bg-border">
            {monthMatrix.map((week, weekIndex) =>
              week.map((day) => {
                const iso = formatDateToISOString(day, academyCountry);
                const daySessions = sessionsByDate[iso] ?? [];
                const isCurrentMonth = isSameMonth(day, parseISO(referenceDate));
                const isDayToday = isTodayInCountryTimezone(day, academyCountry);
                // Usar la zona horaria del país para determinar el día de la semana
                const zonedDay = academyCountry ? convertToCountryTimezone(day, academyCountry) : day;
                const isWeekend = zonedDay.getDay() === 0 || zonedDay.getDay() === 6;

                return (
                  <div
                    key={`${weekIndex}-${iso}`}
                    className={cn(
                      "flex min-h-[120px] flex-col bg-card p-2 transition-colors",
                      !isCurrentMonth && "opacity-40",
                      isDayToday && "bg-gradient-to-br from-zaltyko-primary/10 to-transparent ring-2 ring-zaltyko-primary/20",
                      isWeekend && isCurrentMonth && "bg-muted/20"
                    )}
                  >
                    {/* Número del día */}
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          isDayToday && "flex h-6 w-6 items-center justify-center rounded-full bg-zaltyko-primary text-white"
                        )}
                      >
                        {formatDateForCountry(day, academyCountry, "d")}
                      </span>
                      {daySessions.length > 0 && (
                        <span className="text-[10px] font-semibold text-zaltyko-primary">
                          {daySessions.length}
                        </span>
                      )}
                    </div>

                    {/* Sesiones (máximo 2 en vista compacta) */}
                    <div className="flex-1 space-y-1 overflow-hidden">
                      {daySessions.slice(0, 2).map((session) =>
                        renderSessionChip(session, true)
                      )}
                      {daySessions.length > 2 && (
                        <div className="rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                          +{daySessions.length - 2} más
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}


