"use client";

import { useMemo } from "react";
import { format, subDays, startOfWeek, eachDayOfInterval, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface AttendanceRecord {
  sessionId: string;
  athleteId: string;
  status: "present" | "absent" | "excused";
}

interface SessionInfo {
  id: string;
  classId: string;
  className: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  attendance: AttendanceRecord[];
}

interface ClassInfo {
  id: string;
  name: string;
  capacity: number | null;
}

interface ClassAnalyticsWidgetProps {
  sessions: SessionInfo[];
  classes: ClassInfo[];
  dateRange?: "week" | "month" | "quarter";
}

export function ClassAnalyticsWidget({
  sessions,
  classes,
  dateRange = "month",
}: ClassAnalyticsWidgetProps) {
  const analytics = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (dateRange) {
      case "week":
        startDate = subDays(now, 7);
        break;
      case "month":
        startDate = subDays(now, 30);
        break;
      case "quarter":
        startDate = subDays(now, 90);
        break;
    }

    const filteredSessions = sessions.filter((s) => {
      const sessionDate = parseISO(s.sessionDate);
      return sessionDate >= startDate;
    });

    // Attendance rate por clase
    const attendanceByClass: Record<string, { total: number; present: number; excused: number }> = {};

    filteredSessions.forEach((session) => {
      if (!attendanceByClass[session.classId]) {
        attendanceByClass[session.classId] = { total: 0, present: 0, excused: 0 };
      }

      const attendance = session.attendance || [];
      attendanceByClass[session.classId].total += attendance.length;
      attendanceByClass[session.classId].present += attendance.filter((a) => a.status === "present").length;
      attendanceByClass[session.classId].excused += attendance.filter((a) => a.status === "excused").length;
    });

    const classAttendance = classes.map((clazz) => {
      const stats = attendanceByClass[clazz.id] || { total: 0, present: 0, excused: 0 };
      const rate = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
      return {
        id: clazz.id,
        name: clazz.name,
        totalAttendance: stats.total,
        presentCount: stats.present,
        excusedCount: stats.excused,
        attendanceRate: rate,
      };
    }).sort((a, b) => b.attendanceRate - a.attendanceRate);

    // Popular times (días de la semana con más sesiones)
    const dayOfWeekCounts = new Array(7).fill(0);
    filteredSessions.forEach((session) => {
      const date = parseISO(session.sessionDate);
      dayOfWeekCounts[date.getDay()]++;
    });

    const popularDays = dayOfWeekCounts.map((count, day) => ({
      day,
      dayName: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][day],
      count,
    })).sort((a, b) => b.count - a.count);

    // Popular hours
    const hourCounts: Record<number, number> = {};
    filteredSessions.forEach((session) => {
      if (session.startTime) {
        const hour = parseInt(session.startTime.split(":")[0], 10);
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    });

    const popularHours = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: parseInt(hour, 10), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Sessions per week
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weeks: { week: string; count: number }[] = [];

    for (let i = 0; i < 4; i++) {
      const weekStartDate = subDays(weekStart, i * 7);
      const weekEndDate = subDays(weekStartDate, -7);

      const weekSessions = filteredSessions.filter((s) => {
        const sessionDate = parseISO(s.sessionDate);
        return sessionDate >= weekStartDate && sessionDate < weekEndDate;
      });

      weeks.push({
        week: format(weekStartDate, "MMM d", { locale: es }),
        count: weekSessions.length,
      });
    }

    // Totales generales
    const totalSessions = filteredSessions.length;
    const totalAttendance = Object.values(attendanceByClass).reduce(
      (sum, stats) => sum + stats.total,
      0
    );
    const totalPresent = Object.values(attendanceByClass).reduce(
      (sum, stats) => sum + stats.present,
      0
    );
    const overallAttendanceRate = totalAttendance > 0 ? Math.round((totalPresent / totalAttendance) * 100) : 0;

    return {
      classAttendance,
      popularDays,
      popularHours,
      weeks: weeks.reverse(),
      totalSessions,
      totalAttendance,
      totalPresent,
      overallAttendanceRate,
    };
  }, [sessions, classes, dateRange]);

  const maxDayCount = Math.max(...analytics.popularDays.map((d) => d.count), 1);
  const maxHourCount = Math.max(...analytics.popularHours.map((h) => h.count), 1);

  return (
    <div className="space-y-6">
      {/* Stats overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Asistencia general
          </p>
          <p className="mt-1 text-2xl font-semibold">{analytics.overallAttendanceRate}%</p>
          <p className="text-xs text-muted-foreground">
            {analytics.totalPresent} de {analytics.totalAttendance} registros
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sesiones totales
          </p>
          <p className="mt-1 text-2xl font-semibold">{analytics.totalSessions}</p>
          <p className="text-xs text-muted-foreground">En el período seleccionado</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Clases analizadas
          </p>
          <p className="mt-1 text-2xl font-semibold">{analytics.classAttendance.length}</p>
          <p className="text-xs text-muted-foreground">Con registros de asistencia</p>
        </div>
      </div>

      {/* Attendance by class */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold">Asistencia por clase</h3>
        {analytics.classAttendance.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay datos de asistencia disponibles.</p>
        ) : (
          <div className="space-y-3">
            {analytics.classAttendance.slice(0, 8).map((clazz) => (
              <div key={clazz.id} className="flex items-center gap-3">
                <div className="w-32 flex-1 truncate text-sm">{clazz.name}</div>
                <div className="flex-1">
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${
                        clazz.attendanceRate >= 80
                          ? "bg-green-500"
                          : clazz.attendanceRate >= 60
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${clazz.attendanceRate}%` }}
                    />
                  </div>
                </div>
                <div className="w-12 text-right text-sm font-medium">{clazz.attendanceRate}%</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Popular days and hours */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold">Días más populares</h3>
          <div className="space-y-2">
            {analytics.popularDays.map((day) => (
              <div key={day.day} className="flex items-center gap-3">
                <div className="w-20 text-sm text-muted-foreground">{day.dayName}</div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${(day.count / maxDayCount) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="w-8 text-right text-sm">{day.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold">Horarios más populares</h3>
          {analytics.popularHours.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay datos de horarios disponibles.</p>
          ) : (
            <div className="space-y-2">
              {analytics.popularHours.map((hour) => (
                <div key={hour.hour} className="flex items-center gap-3">
                  <div className="w-16 text-sm text-muted-foreground">
                    {hour.hour.toString().padStart(2, "0")}:00
                  </div>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${(hour.count / maxHourCount) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-8 text-right text-sm">{hour.count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sessions per week */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold">Sesiones por semana</h3>
        <div className="flex items-end gap-2">
          {analytics.weeks.map((week, index) => {
            const maxCount = Math.max(...analytics.weeks.map((w) => w.count), 1);
            const height = Math.max((week.count / maxCount) * 100, 10);

            return (
              <div key={index} className="flex-1">
                <div className="relative">
                  <div
                    className="mx-auto w-full rounded-t bg-primary/80"
                    style={{ height: `${height}px` }}
                  />
                  {week.count > 0 && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-medium">
                      {week.count}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">{week.week}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
