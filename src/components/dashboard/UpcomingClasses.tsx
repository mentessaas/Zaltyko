"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Users, ClipboardCheck, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AlertBadge } from "@/components/shared/AlertBadge";
import type { DashboardUpcomingClass } from "@/lib/dashboard";
import { formatShortDateForCountry, formatTimeForCountry } from "@/lib/date-utils";

interface UpcomingClassesProps {
  classes: DashboardUpcomingClass[];
  academyId: string;
  academyCountry: string | null;
}

export function UpcomingClasses({ classes, academyId, academyCountry }: UpcomingClassesProps) {
  const router = useRouter();
  const [capacityAlerts, setCapacityAlerts] = useState<Set<string>>(new Set());
  
  // Limitar a 5 clases para el dashboard
  const displayedClasses = classes.slice(0, 5);

  useEffect(() => {
    // Obtener alertas de capacidad para mostrar badges
    const fetchCapacityAlerts = async () => {
      try {
        const response = await fetch(`/api/alerts/capacity?academyId=${academyId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.alerts && Array.isArray(data.alerts)) {
            // Crear un Set con los IDs de clases con cupo >= 95%
            const alertClassIds = new Set<string>(
              data.alerts
                .filter((alert: { percentage: number }) => alert.percentage >= 95)
                .map((alert: { classId: string }) => String(alert.classId))
            );
            setCapacityAlerts(alertClassIds);
          }
        }
      } catch (error) {
        console.error("Error fetching capacity alerts:", error);
      }
    };

    fetchCapacityAlerts();
  }, [academyId]);

  return (
    <div className="space-y-5 rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
            Próximas clases
          </p>
          <h3 className="mt-1 text-xl font-semibold text-foreground">
            {classes.length > 0 ? "Programadas para los próximos días" : "Sin clases programadas"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {classes.length > 0
              ? "Tus próximas sesiones programadas. Pasa asistencia directamente desde aquí."
              : "Agenda nuevas clases para visualizar tu calendario aquí."}
          </p>
        </div>
        {classes.length > 0 && (
          <Link
            href={`/app/${academyId}/classes`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition hover:underline"
          >
            Ver todas
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </header>

      <div className="space-y-3">
        {displayedClasses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
            Agenda nuevas clases para visualizar tu calendario aquí.
          </div>
        ) : (
          displayedClasses.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-sm transition hover:border-primary/40 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/app/${academyId}/classes/${item.classId}`}
                      className="font-semibold text-foreground transition hover:text-primary"
                    >
                      {item.className ?? "Clase sin nombre"}
                    </Link>
                    {capacityAlerts.has(item.classId) && (
                      <AlertBadge type="capacity" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.isSessionPlaceholder ? (
                      <span>
                        {formatShortDateForCountry(item.sessionDate, academyCountry)} · genera sesiones para ver fechas exactas
                      </span>
                    ) : (
                      <>
                        {formatShortDateForCountry(item.sessionDate, academyCountry)} ·{" "}
                        {item.startTime && item.endTime
                          ? `${formatTimeForCountry(item.sessionDate + "T" + item.startTime, academyCountry)} – ${formatTimeForCountry(item.sessionDate + "T" + item.endTime, academyCountry)}`
                          : item.startTime
                          ? `Desde ${formatTimeForCountry(item.sessionDate + "T" + item.startTime, academyCountry)}`
                          : "Horario por definir"}
                      </>
                    )}
                  </p>
                </div>
                <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground/70" strokeWidth={1.6} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
                  <Users className="h-3 w-3" strokeWidth={1.8} />
                  {item.coaches.length > 0
                    ? item.coaches.map((coach) => coach.name ?? "Sin nombre").join(", ")
                    : "Sin entrenador"}
                </div>
                {item.groupName && (
                  <span
                    className="inline-flex items-center gap-2 rounded-full border px-2 py-1 font-semibold"
                    style={
                      item.groupColor
                        ? { color: item.groupColor, borderColor: item.groupColor }
                        : undefined
                    }
                  >
                    {item.groupName}
                  </span>
                )}
                {item.isSessionPlaceholder && (
                  <span className="rounded-full border border-dashed px-2 py-1 text-[0.7rem] font-semibold text-amber-700">
                    Sesiones no generadas
                  </span>
                )}
              </div>
              {!item.isSessionPlaceholder && (
                <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => router.push(`/app/${academyId}/classes/${item.classId}`)}
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Ver / Pasar asistencia
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

