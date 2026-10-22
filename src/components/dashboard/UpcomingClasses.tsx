"use client";

import { memo } from "react";
import Link from "next/link";
import { CalendarClock, Users, ClipboardCheck, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AlertBadge } from "@/components/shared/AlertBadge";
import { useAcademyContext } from "@/hooks/use-academy-context";
import type { DashboardUpcomingClass } from "@/lib/dashboard";
import {
  formatShortDateForCountry,
  formatTimeForCountry,
  getTodayInCountryTimezone,
  isSameDayInTimezone,
} from "@/lib/date-utils";
import { isValidClassTimeRange } from "@/lib/classes/time-validation";
import { pluralizeFirstWord } from "@/lib/specialization/registry";

interface UpcomingClassesProps {
  classes: DashboardUpcomingClass[];
  academyId: string;
  academyCountry: string | null;
  capacityAlertClassIds?: ReadonlySet<string>;
}

function UpcomingClassesImpl({
  classes,
  academyId,
  academyCountry,
  capacityAlertClassIds = EMPTY_CAPACITY_ALERTS,
}: UpcomingClassesProps) {
  const { specialization } = useAcademyContext();
  const classLabelPlural = pluralizeFirstWord(specialization.labels.classLabel).toLowerCase();
  const coachLabelPlural = pluralizeFirstWord(specialization.labels.coachLabel).toLowerCase();

  // Limitar a 5 clases para el dashboard
  const displayedClasses = classes.slice(0, 5);

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {`Calendario de ${classLabelPlural}`}
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold text-foreground">
            {classes.length > 0 ? "Programadas para los próximos días" : `Sin ${classLabelPlural} en el calendario`}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {classes.length > 0
              ? "Tus próximas sesiones programadas. Pasa asistencia directamente desde aquí."
              : `Crea ${classLabelPlural} para ver el calendario aquí.`}
          </p>
        </div>
        {classes.length > 0 && (
          <Link
            href={`/app/${academyId}/classes`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-zaltyko-teal transition hover:underline"
          >
            Ver todas
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </header>

      <div className="space-y-3">
        {displayedClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
            <CalendarClock className="mb-2 h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              No hay {classLabelPlural} en el calendario
            </p>
            <p className="text-xs text-muted-foreground/70">
              Crea {classLabelPlural} para ver el calendario aquí
            </p>
          </div>
        ) : (
          displayedClasses.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm transition hover:border-zaltyko-teal/40 hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/app/${academyId}/classes/${item.classId}`}
                      className="font-semibold text-foreground transition hover:text-zaltyko-teal"
                    >
                      {item.className ?? `${specialization.labels.classLabel} sin nombre`}
                    </Link>
                    {capacityAlertClassIds.has(item.classId) && (
                      <AlertBadge type="capacity" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.isSessionPlaceholder ? (
                      <span>
                        {item.sessionDate} · genera sesiones para ver fechas exactas
                      </span>
                    ) : (
                      <>
                        {formatShortDateForCountry(item.sessionDate, academyCountry)} ·{" "}
                        {item.startTime && item.endTime && isValidClassTimeRange(item.startTime, item.endTime)
                          ? `${formatTimeForCountry(item.sessionDate + "T" + item.startTime, academyCountry)} – ${formatTimeForCountry(item.sessionDate + "T" + item.endTime, academyCountry)}`
                          : item.startTime
                          ? isValidClassTimeRange(item.startTime, item.endTime)
                            ? `Desde ${formatTimeForCountry(item.sessionDate + "T" + item.startTime, academyCountry)}`
                            : "Horario por revisar"
                          : "Horario por definir"}
                      </>
                    )}
                  </p>
                </div>
                <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
                  <Users className="h-3 w-3" strokeWidth={1.8} />
                  {item.coaches.length > 0
                    ? item.coaches.map((coach) => coach.name ?? "Sin nombre").join(", ")
                    : `Sin ${coachLabelPlural}`}
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
                  <span className="rounded-full border border-dashed border-zaltyko-navy/35 px-2 py-1 text-[0.7rem] font-semibold text-foreground">
                    Sesiones no generadas
                  </span>
                )}
              </div>
              {item.isSessionPlaceholder && (
                <div className="flex items-center gap-2 border-t border-border/60 pt-1">
                  <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <Link href={`/app/${academyId}/classes/${item.classId}`}>
                      <CalendarClock className="h-3.5 w-3.5" />
                      Configurar sesiones
                    </Link>
                  </Button>
                </div>
              )}
              {!item.isSessionPlaceholder && (() => {
                const isToday = isSameDayInTimezone(
                  item.sessionDate,
                  getTodayInCountryTimezone(academyCountry),
                  academyCountry,
                );
                const actionHref = isToday
                  ? `/app/${academyId}/attendance/today/${item.id}`
                  : `/app/${academyId}/classes/${item.classId}`;

                return (
                <div className="flex items-center gap-2 border-t border-border/60 pt-1">
                  <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <Link href={actionHref}>
                      {isToday ? (
                        <ClipboardCheck className="h-3.5 w-3.5" />
                      ) : (
                        <CalendarClock className="h-3.5 w-3.5" />
                      )}
                      {isToday ? "Pasar asistencia" : "Ver clase"}
                    </Link>
                  </Button>
                </div>
                );
              })()}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const EMPTY_CAPACITY_ALERTS: ReadonlySet<string> = new Set();

export const UpcomingClasses = memo(UpcomingClassesImpl);
