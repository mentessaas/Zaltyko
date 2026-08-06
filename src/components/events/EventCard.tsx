import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EventStatusBadge, EventCapacityBadge } from "./EventStatusBadge";
import { EventDateDisplay } from "./EventDateDisplay";
import { EventCountdown } from "./EventCountdown";
import { Users, MapPin, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

type EventStatus = "draft" | "published" | "cancelled" | "completed";
type EventLevel = "internal" | "local" | "national" | "international";

interface EventCardProps {
  event: {
    id: string;
    academyId?: string | null;
    title: string;
    description?: string | null;
    startDate: string | Date | null;
    endDate?: string | Date | null;
    registrationStartDate?: string | Date | null;
    registrationEndDate?: string | Date | null;
    level?: EventLevel | null;
    discipline?: string | null;
    eventType?: string | null;
    status?: EventStatus | null;
    isPublic?: boolean;
    maxCapacity?: number | null;
    registrationFee?: number | null;
    allowWaitlist?: boolean;
    countryName?: string | null;
    provinceName?: string | null;
    cityName?: string | null;
    academyName?: string;
    registrationCount?: number;
  };
  showAcademy?: boolean;
  showCountdown?: boolean;
  className?: string;
}

const levelLabels: Record<EventLevel, string> = {
  internal: "Interno",
  local: "Local",
  national: "Nacional",
  international: "Internacional",
};

const disciplineLabels: Record<string, string> = {
  artistic_female: "Artística Femenina",
  artistic_male: "Artística Masculina",
  rhythmic: "Rítmica",
};

function formatPrice(cents: number | null | undefined): string {
  if (!cents) return "Gratis";
  return `${(cents / 100).toFixed(2)} €`;
}

export function EventCard({
  event,
  showAcademy = false,
  showCountdown = false,
  className,
}: EventCardProps) {
  const now = new Date();
  const isUpcoming = event.startDate && new Date(event.startDate) > now;
  const isRegistrationOpen =
    event.registrationStartDate &&
    event.registrationEndDate &&
    new Date(event.registrationStartDate) <= now &&
    new Date(event.registrationEndDate) >= now;

  const detailHref = event.academyId
    ? `/app/${event.academyId}/events/${event.id}`
    : `/dashboard/events/${event.id}`;

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden transition hover:border-zaltyko-teal/40", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="line-clamp-2 font-display text-lg font-semibold text-zaltyko-navy">{event.title}</h3>
            {showAcademy && event.academyName && (
              <p className="mt-1 text-sm text-zaltyko-text-secondary">{event.academyName}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {event.status && event.status !== "published" && (
              <EventStatusBadge status={event.status} />
            )}
            {event.isPublic && (
              <Badge variant="outline" className="text-[10px]">
                Público
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 text-sm">
        {/* Nivel y disciplina */}
        <div className="flex flex-wrap gap-1.5">
          {event.level && (
            <Badge variant="outline" className="text-xs">
              {levelLabels[event.level] || event.level}
            </Badge>
          )}
          {event.discipline && (
            <Badge variant="outline" className="text-xs">
              {disciplineLabels[event.discipline] || event.discipline}
            </Badge>
          )}
        </div>

        {/* Fechas */}
        <EventDateDisplay
          startDate={event.startDate}
          endDate={event.endDate}
          registrationStartDate={event.registrationStartDate}
          registrationEndDate={event.registrationEndDate}
        />

        {/* Ubicación */}
        {(event.cityName || event.provinceName || event.countryName) && (
          <div className="flex items-center gap-1.5 text-zaltyko-text-secondary">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-1 text-xs">
              {[event.cityName, event.provinceName, event.countryName].filter(Boolean).join(", ")}
            </span>
          </div>
        )}

        {/* Capacidad y precio */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {event.maxCapacity ? (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-zaltyko-text-secondary" />
              <EventCapacityBadge
                current={event.registrationCount || 0}
                max={event.maxCapacity}
                allowWaitlist={event.allowWaitlist ?? true}
              />
            </div>
          ) : (
            <div />
          )}
          {event.registrationFee !== undefined && (
            <div className="flex items-center gap-1.5">
              <Ticket className="h-3.5 w-3.5 text-zaltyko-text-secondary" />
              <span className="text-sm font-medium text-zaltyko-navy">{formatPrice(event.registrationFee)}</span>
            </div>
          )}
        </div>

        {/* Countdown */}
        {showCountdown && isUpcoming && event.startDate && (
          <div className="border-t border-zaltyko-mist pt-2">
            <p className="mb-2 text-center text-xs text-zaltyko-text-secondary">
              {isRegistrationOpen ? "El evento comienza en:" : "Próximamente:"}
            </p>
            <EventCountdown targetDate={event.startDate} size="sm" />
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2">
        <Button asChild variant="secondary" className="w-full">
          <Link href={detailHref}>Ver detalles</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
