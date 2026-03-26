"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, startOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const WEEKDAY_LABELS = [
  { day: 0, label: "Domingo", short: "Dom" },
  { day: 1, label: "Lunes", short: "Lun" },
  { day: 2, label: "Martes", short: "Mar" },
  { day: 3, label: "Miércoles", short: "Mié" },
  { day: 4, label: "Jueves", short: "Jue" },
  { day: 5, label: "Viernes", short: "Vie" },
  { day: 6, label: "Sábado", short: "Sáb" },
];

interface Coach {
  id: string;
  name: string;
}

interface ClassSession {
  id: string;
  classId: string;
  className: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  capacity: number | null;
  currentEnrollment: number;
  coachName: string | null;
  groupColor: string | null;
}

interface CalendarClass {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  currentEnrollment?: number;
  coaches: Coach[];
  groupColor?: string | null;
  allowsFreeTrial?: boolean;
  waitingListEnabled?: boolean;
}

interface ClassesCalendarViewProps {
  academyId: string;
  classes: CalendarClass[];
  sessions?: ClassSession[];
  weekOffset?: number;
}

export function ClassesCalendarView({
  academyId,
  classes,
  sessions = [],
  weekOffset = 0,
}: ClassesCalendarViewProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [draggedClass, setDraggedClass] = useState<CalendarClass | null>(null);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getClassesForDay = (date: Date) => {
    const dayOfWeek = date.getDay();
    return classes.filter((c) => c.weekdays.includes(dayOfWeek));
  };

  const getSessionsForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return sessions.filter((s) => s.sessionDate === dateStr);
  };

  const getOccupancyPercentage = (classItem: CalendarClass) => {
    if (!classItem.capacity || classItem.capacity === 0) return 0;
    const enrollment = classItem.currentEnrollment ?? 0;
    return Math.min(100, Math.round((enrollment / classItem.capacity) * 100));
  };

  const getOccupancyColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 70) return "bg-yellow-500";
    return "bg-green-500";
  };

  const handlePrevWeek = () => {
    setSelectedDate((d) => addDays(d, -7));
  };

  const handleNextWeek = () => {
    setSelectedDate((d) => addDays(d, 7));
  };

  const handleDragStart = (classItem: CalendarClass) => {
    setDraggedClass(classItem);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (date: Date) => {
    if (draggedClass) {
      console.log("Mover clase:", draggedClass.name, "a", format(date, "yyyy-MM-dd"));
      // Aquí se implementaría la lógica de mover la clase
      setDraggedClass(null);
    }
  };

  const timeSlots = Array.from({ length: 14 }, (_, i) => {
    const hour = 7 + i;
    return `${hour.toString().padStart(2, "0")}:00`;
  });

  const getClassPosition = (classItem: CalendarClass) => {
    if (!classItem.startTime) return null;
    const [hours, minutes] = classItem.startTime.split(":").map(Number);
    const startHour = hours + (minutes || 0) / 60;
    const top = (startHour - 7) * 60;
    return top;
  };

  return (
    <div className="space-y-4">
      {/* Header del calendario */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">
            {format(weekStart, "MMMM yyyy", { locale: es })}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevWeek}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Anterior
          </button>
          <button
            onClick={() => setSelectedDate(new Date())}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Hoy
          </button>
          <button
            onClick={handleNextWeek}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs">
          <span className="h-3 w-3 rounded-full bg-green-500" />
          <span>Disponible (&lt;70%)</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-3 w-3 rounded-full bg-yellow-500" />
          <span>Casi llena (70-90%)</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span>Llena (&gt;90%)</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-3 w-3 rounded-full border-2 border-blue-400 border-dashed" />
          <span>Clase de prueba</span>
        </div>
      </div>

      {/* Calendario */}
      <div className="overflow-hidden rounded-lg border bg-card shadow">
        {/* Días de la semana */}
        <div className="grid grid-cols-8 border-b bg-muted/60">
          <div className="p-2 text-center text-xs font-medium text-muted-foreground">Hora</div>
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className={`p-2 text-center text-sm font-medium ${
                isSameDay(day, new Date()) ? "bg-primary/10 text-primary" : ""
              }`}
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {WEEKDAY_LABELS[day.getDay()].short}
              </div>
              <div className="text-lg font-semibold">{format(day, "d")}</div>
            </div>
          ))}
        </div>

        {/* Horarios */}
        <div className="relative max-h-[600px] overflow-y-auto">
          {timeSlots.map((time) => (
            <div key={time} className="grid grid-cols-8 border-b border-border/50">
              <div className="p-1 text-xs text-muted-foreground">{time}</div>
              {weekDays.map((day) => {
                const dayClasses = getClassesForDay(day);
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={`${day.toISOString()}-${time}`}
                    className={`min-h-[60px] border-l border-border/30 p-1 transition-colors ${
                      isToday ? "bg-primary/5" : ""
                    } ${draggedClass ? "hover:bg-muted/50" : ""}`}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(day)}
                  >
                    {dayClasses
                      .filter((c) => c.startTime?.startsWith(time))
                      .map((classItem) => {
                        const occupancy = getOccupancyPercentage(classItem);
                        const position = getClassPosition(classItem);

                        return (
                          <div
                            key={classItem.id}
                            draggable
                            onDragStart={() => handleDragStart(classItem)}
                            className={`mb-1 cursor-move rounded-md border p-2 text-xs shadow-sm transition-transform hover:scale-[1.02] ${
                              classItem.allowsFreeTrial
                                ? "border-blue-400 bg-blue-50"
                                : "border-border bg-white"
                            }`}
                            style={{
                              borderLeftColor: classItem.groupColor || "#6366f1",
                              borderLeftWidth: "3px",
                            }}
                          >
                            <div className="font-semibold truncate">{classItem.name}</div>
                            <div className="text-muted-foreground">
                              {classItem.startTime}
                              {classItem.endTime && ` - ${classItem.endTime}`}
                            </div>
                            {classItem.capacity && (
                              <div className="mt-1">
                                <div className="flex items-center gap-1">
                                  <div className="h-1.5 flex-1 rounded-full bg-muted">
                                    <div
                                      className={`h-1.5 rounded-full ${getOccupancyColor(occupancy)}`}
                                      style={{ width: `${occupancy}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">
                                    {occupancy}%
                                  </span>
                                </div>
                              </div>
                            )}
                            {classItem.coaches.length > 0 && (
                              <div className="mt-1 truncate text-[10px] text-muted-foreground">
                                {classItem.coaches[0].name}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Lista de clases del día seleccionado */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">
          Clases del {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
        </h3>
        {getClassesForDay(selectedDate).length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay clases programadas para este día.</p>
        ) : (
          <div className="space-y-2">
            {getClassesForDay(selectedDate).map((classItem) => {
              const occupancy = getOccupancyPercentage(classItem);
              return (
                <div
                  key={classItem.id}
                  className="flex items-center justify-between rounded-md border p-3"
                  style={{ borderLeftColor: classItem.groupColor || "#6366f1", borderLeftWidth: "3px" }}
                >
                  <div>
                    <div className="font-medium">{classItem.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {classItem.startTime}
                      {classItem.endTime && ` - ${classItem.endTime}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-sm">
                        {classItem.currentEnrollment ?? 0} / {classItem.capacity ?? "∞"}
                      </span>
                    </div>
                    {classItem.coaches.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {classItem.coaches.map((c) => c.name).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
