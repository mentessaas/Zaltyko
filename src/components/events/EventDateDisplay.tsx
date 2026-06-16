import { Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface EventDateDisplayProps {
  startDate: string | Date | null;
  endDate?: string | Date | null;
  registrationStartDate?: string | Date | null;
  registrationEndDate?: string | Date | null;
  showRegistrationDates?: boolean;
  className?: string;
}

function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return "Por confirmar";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateShort(dateStr: string | Date | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

function formatTime(dateStr: string | Date | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameDay(date1: string | Date | null | undefined, date2: string | Date | null | undefined): boolean {
  if (!date1 || !date2) return false;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isConsecutive(date1: string | Date | null | undefined, date2: string | Date | null | undefined): boolean {
  if (!date1 || !date2) return false;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 1;
}

export function EventDateDisplay({
  startDate,
  endDate,
  registrationStartDate,
  registrationEndDate,
  showRegistrationDates = false,
  className,
}: EventDateDisplayProps) {
  const isSameDayEvent = isSameDay(startDate, endDate);
  const isConsecutiveDays = isConsecutive(startDate, endDate);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Fechas del evento */}
      <div className="flex items-start gap-2">
        <Calendar className="h-4 w-4 mt-0.5 text-zaltyko-primary shrink-0" />
        <div>
          {startDate && endDate ? (
            <div>
              {isSameDayEvent ? (
                <span className="font-medium">{formatDate(startDate)}</span>
              ) : isConsecutiveDays ? (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="font-medium">{formatDateShort(startDate)}</span>
                  <span className="text-muted-foreground">-</span>
                  <span className="font-medium">{formatDate(endDate)}</span>
                </div>
              ) : (
                <div>
                  <span className="font-medium">{formatDate(startDate)}</span>
                  {endDate && (
                    <>
                      <span className="text-muted-foreground"> - </span>
                      <span className="font-medium">{formatDate(endDate)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : startDate ? (
            <span className="font-medium">{formatDate(startDate)}</span>
          ) : (
            <span className="text-muted-foreground">Por confirmar</span>
          )}
        </div>
      </div>

      {/* Fechas de inscripción */}
      {showRegistrationDates && (registrationStartDate || registrationEndDate) && (
        <div className="flex items-start gap-2">
          <Clock className="h-4 w-4 mt-0.5 text-zaltyko-secondary shrink-0" />
          <div className="text-sm">
            <span className="text-muted-foreground">Inscripción: </span>
            {registrationStartDate && registrationEndDate ? (
              <span>
                {formatDateShort(registrationStartDate)} - {formatDateShort(registrationEndDate)}
              </span>
            ) : registrationStartDate ? (
              <span>Desde {formatDateShort(registrationStartDate)}</span>
            ) : registrationEndDate ? (
              <span>Hasta {formatDateShort(registrationEndDate)}</span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
