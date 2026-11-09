"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Clock, Users, ArrowRight, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DashboardUpcomingClass } from "@/lib/dashboard";
import { isSameDayInTimezone, getTodayInCountryTimezone, formatTimeForCountry } from "@/lib/date-utils";

interface TodayClassesWidgetProps {
  classes: DashboardUpcomingClass[];
  academyId: string;
  academyCountry: string | null;
}

export function TodayClassesWidget({ classes, academyId, academyCountry }: TodayClassesWidgetProps) {
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

  // Pizarra de sesiones «Magnesio sobre tapiz»: hora condensada grande,
  // grupo y entrenadora, y la acción de pasar lista en cada fila.
  return (
    <section aria-labelledby="today-classes-title" className="overflow-hidden rounded-xl border border-chalk-line bg-white">
      <header className="flex items-center justify-between gap-3 border-b-[3px] border-mat px-5 py-3">
        <h2 id="today-classes-title" className="floor-label text-mat">
          Hoy en pista · {sortedClasses.length} {sortedClasses.length === 1 ? "sesión" : "sesiones"}
        </h2>
        <Link
          href={`/app/${academyId}/classes?date=today`}
          className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-mat hover:underline"
        >
          Ver todas
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </header>

      <ul>
        {sortedClasses.slice(0, 4).map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-chalk-line px-5 py-4 last:border-b-0 sm:flex-nowrap">
            <p className="font-display tabular w-20 shrink-0 text-3xl font-black leading-none text-mat-night">
              {item.startTime ? formatTimeForCountry(item.sessionDate + "T" + item.startTime, academyCountry) : "--:--"}
            </p>
            <div className="min-w-0 flex-1">
              <Link
                href={`/app/${academyId}/classes/${item.classId}`}
                className="block truncate font-semibold text-mat-night hover:text-mat hover:underline"
              >
                {item.className ?? "Clase sin nombre"}
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ramp-500">
                {item.endTime && (
                  <span className="inline-flex items-center gap-1">
                    <Clock aria-hidden className="h-3.5 w-3.5" />
                    hasta {formatTimeForCountry(item.sessionDate + "T" + item.endTime, academyCountry)}
                  </span>
                )}
                {item.coaches.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Users aria-hidden className="h-3.5 w-3.5" />
                    {item.coaches.map((c) => c.name).join(", ")}
                  </span>
                )}
              </p>
            </div>
            <Button asChild size="sm" className="w-full shrink-0 gap-1.5 sm:w-auto">
              <Link href={`/app/${academyId}/attendance/today/${item.id}`}>
                <ClipboardCheck aria-hidden className="h-3.5 w-3.5" />
                Pasar asistencia
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      {sortedClasses.length > 4 && (
        <p className="border-t border-chalk-line px-5 py-3 text-sm text-ramp-500">
          Y {sortedClasses.length - 4} {sortedClasses.length - 4 === 1 ? "sesión más" : "sesiones más"} hoy
        </p>
      )}
    </section>
  );
}
