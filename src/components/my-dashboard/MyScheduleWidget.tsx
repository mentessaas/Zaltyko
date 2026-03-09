"use client";

import { CalendarClock, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatShortDateForCountry, formatTimeForCountry } from "@/lib/date-utils";

interface SessionData {
  id: string;
  classId: string;
  className: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  groupName: string | null;
  groupColor: string | null;
  coachName: string | null;
  status: string;
}

interface MyScheduleWidgetProps {
  sessions: SessionData[];
  academyCountry: string | null;
}

export function MyScheduleWidget({ sessions, academyCountry }: MyScheduleWidgetProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CalendarClock className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          No hay clases programadas
        </p>
        <p className="text-xs text-muted-foreground">
          Pronto tendrás nuevas clases
        </p>
      </div>
    );
  }

  // Mostrar máximo 5 clases
  const displaySessions = sessions.slice(0, 5);

  const isToday = (dateStr: string) => {
    const today = new Date().toISOString().split("T")[0];
    return dateStr === today;
  };

  const getDayName = (dateStr: string) => {
    const date = new Date(dateStr);
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    return days[date.getDay()];
  };

  return (
    <div className="space-y-3">
      {displaySessions.map((session) => (
        <div
          key={session.id}
          className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/50 p-3 transition hover:border-primary/30"
        >
          {/* Indicador de fecha */}
          <div
            className={`flex h-12 w-12 flex-col items-center justify-center rounded-lg text-center ${
              isToday(session.sessionDate)
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            }`}
          >
            <span className="text-xs font-medium uppercase">
              {getDayName(session.sessionDate)}
            </span>
            <span className="text-lg font-bold leading-none">
              {new Date(session.sessionDate).getDate()}
            </span>
          </div>

          {/* Información de la clase */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-foreground truncate">
                {session.className}
              </h4>
              {isToday(session.sessionDate) && (
                <Badge variant="default" className="text-xs">
                  Hoy
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {session.startTime && (
                <span className="flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  {formatTimeForCountry(
                    session.sessionDate + "T" + session.startTime,
                    academyCountry
                  )}
                  {session.endTime &&
                    ` - ${formatTimeForCountry(
                      session.sessionDate + "T" + session.endTime,
                      academyCountry
                    )}`}
                </span>
              )}
              {session.coachName && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {session.coachName}
                </span>
              )}
            </div>
            {session.groupName && (
              <Badge
                variant="outline"
                className="mt-2 text-xs"
                style={
                  session.groupColor
                    ? {
                        borderColor: session.groupColor,
                        color: session.groupColor,
                      }
                    : undefined
                }
              >
                {session.groupName}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
