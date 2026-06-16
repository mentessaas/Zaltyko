"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock, Users, ArrowRight, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DashboardUpcomingClass } from "@/lib/dashboard";
import { isSameDayInTimezone, getTodayInCountryTimezone, formatShortDateForCountry, formatTimeForCountry } from "@/lib/date-utils";

interface TodayClassesWidgetProps {
  classes: DashboardUpcomingClass[];
  academyId: string;
  academyCountry: string | null;
}

export function TodayClassesWidget({ classes, academyId, academyCountry }: TodayClassesWidgetProps) {
  const router = useRouter();
  
  // Filtrar solo las clases de hoy según la zona horaria del país
  const todayClasses = useMemo(() => {
    const today = getTodayInCountryTimezone(academyCountry);
    
    return classes.filter((c) => {
      if (c.isSessionPlaceholder) return false;
      return isSameDayInTimezone(c.sessionDate, today, academyCountry);
    });
  }, [classes, academyCountry]);

  if (todayClasses.length === 0) {
    return null;
  }

  // Ordenar por hora de inicio
  const sortedClasses = [...todayClasses].sort((a, b) => {
    if (!a.startTime || !b.startTime) return 0;
    return a.startTime.localeCompare(b.startTime);
  });

  return (
    <div className="space-y-4 rounded-2xl border border-zaltyko-teal/30 bg-zaltyko-teal/5 p-6 shadow-soft">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zaltyko-teal/12">
            <CalendarClock className="h-5 w-5 text-zaltyko-teal" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-zaltyko-teal">
              Clases de hoy
            </p>
            <h3 className="mt-0.5 font-display text-xl font-semibold text-zaltyko-navy">
              {sortedClasses.length} {sortedClasses.length === 1 ? "clase programada" : "clases programadas"}
            </h3>
          </div>
        </div>
        <Link
          href={`/app/${academyId}/classes?date=today`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-zaltyko-teal transition hover:underline"
        >
          Ver todas
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="space-y-2">
        {sortedClasses.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-zaltyko-teal/20 bg-white px-4 py-3 transition hover:border-zaltyko-teal/40 hover:bg-zaltyko-white"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={`/app/${academyId}/classes/${item.classId}`}
                  className="font-semibold text-zaltyko-navy transition hover:text-zaltyko-teal"
                >
                  {item.className ?? "Clase sin nombre"}
                </Link>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {item.startTime && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>
                      {formatTimeForCountry(item.sessionDate + "T" + item.startTime, academyCountry)}
                      {item.endTime && ` - ${formatTimeForCountry(item.sessionDate + "T" + item.endTime, academyCountry)}`}
                    </span>
                  </div>
                )}
                {item.coaches.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{item.coaches.map((c) => c.name).join(", ")}</span>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => router.push(`/app/${academyId}/classes/${item.classId}`)}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Asistencia
            </Button>
          </div>
        ))}
        {sortedClasses.length > 3 && (
          <p className="text-center text-xs text-muted-foreground pt-2">
            Y {sortedClasses.length - 3} {sortedClasses.length - 3 === 1 ? "clase más" : "clases más"} hoy
          </p>
        )}
      </div>
    </div>
  );
}
