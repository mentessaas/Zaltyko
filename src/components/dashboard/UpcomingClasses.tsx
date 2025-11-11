"use client";

import Link from "next/link";
import { CalendarClock, Users } from "lucide-react";

import type { DashboardUpcomingClass } from "@/lib/dashboard";

interface UpcomingClassesProps {
  classes: DashboardUpcomingClass[];
  academyId: string;
}

export function UpcomingClasses({ classes, academyId }: UpcomingClassesProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
            Próximas clases
          </p>
          <h3 className="text-lg font-semibold text-foreground">
            {classes.length > 0 ? "Programadas para los próximos días" : "Sin clases programadas"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Mostrando los próximos 3 días de sesiones programadas.
          </p>
        </div>
        <Link
          href={`/app/${academyId}/classes`}
          className="text-xs font-semibold text-primary transition hover:underline"
        >
          Ver todas
        </Link>
      </header>

      <div className="space-y-3">
        {classes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
            Agenda nuevas clases para visualizar tu calendario aquí.
          </div>
        ) : (
          classes.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-sm transition hover:border-border"
            >
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/app/${academyId}/classes/${item.classId}`}
                    className="font-semibold text-foreground transition hover:text-primary"
                  >
                    {item.className ?? "Clase sin nombre"}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {item.sessionDate} ·{" "}
                    {item.startTime && item.endTime
                      ? `${item.startTime} – ${item.endTime}`
                      : item.startTime
                      ? `Desde ${item.startTime}`
                      : "Horario por definir"}
                  </p>
                </div>
                <CalendarClock className="h-4 w-4 text-muted-foreground/70" strokeWidth={1.6} />
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
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

