"use client";

import { CalendarDays, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useAcademyContext } from "@/hooks/use-academy-context";

interface CalendarSession {
  id: string;
  className: string;
  startTime: string | null;
  endTime: string | null;
  groupName: string | null;
  groupColor: string | null;
  technicalFocus: string | null;
  apparatus: string[];
}

interface MyCalendarWidgetProps {
  profileId?: string;
  sessionsByDay?: { date: string; sessions: CalendarSession[] }[];
}

export function MyCalendarWidget({ sessionsByDay = [] }: MyCalendarWidgetProps) {
  const { specialization } = useAcademyContext();
  const apparatusLabels = Object.fromEntries(
    specialization.evaluation.apparatus.map((item) => [item.code, item.label])
  );

  if (sessionsByDay.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CalendarDays className="h-10 w-10 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">No hay sesiones previstas</p>
        <p className="text-xs text-muted-foreground">
          Cuando haya actividad programada, aparecerá aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessionsByDay.slice(0, 5).map((day) => (
        <div key={day.date} className="rounded-lg border p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">
              {new Date(day.date).toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </h3>
            <Badge variant="outline">{day.sessions.length} sesión{day.sessions.length === 1 ? "" : "es"}</Badge>
          </div>

          <div className="space-y-3">
            {day.sessions.map((session) => (
              <div key={session.id} className="rounded-md bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{session.className}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {session.startTime && (
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {session.startTime?.slice(0, 5)}
                          {session.endTime ? ` - ${session.endTime.slice(0, 5)}` : ""}
                        </span>
                      )}
                      {session.groupName && <span>{session.groupName}</span>}
                    </div>
                  </div>
                </div>
                {(session.technicalFocus || session.apparatus.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {session.technicalFocus && (
                      <span className="rounded-full bg-background px-2 py-1 text-[11px] text-muted-foreground">
                        {session.technicalFocus}
                      </span>
                    )}
                    {session.apparatus.slice(0, 2).map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground"
                      >
                        {apparatusLabels[item] || item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
