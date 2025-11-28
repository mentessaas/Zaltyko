import Image from "next/image";
import { MapPin, Calendar, Users } from "lucide-react";
import type { PublicEvent } from "@/types/events";

interface EventHeroProps {
  event: PublicEvent & { academy?: { id: string; name: string; logoUrl: string | null } | null };
}

const EVENT_LEVEL_LABELS: Record<string, string> = {
  internal: "Interno",
  local: "Local",
  national: "Nacional",
  international: "Internacional",
};

const EVENT_DISCIPLINE_LABELS: Record<string, string> = {
  artistic_female: "Gimnasia Artística Femenina",
  artistic_male: "Gimnasia Artística Masculina",
  rhythmic: "Gimnasia Rítmica",
  trampoline: "Trampolín",
  parkour: "Parkour",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Fecha por confirmar";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  competitions: "Competición",
  courses: "Curso",
  camps: "Campamento",
  workshops: "Taller",
  clinics: "Clínica",
  evaluations: "Evaluación",
  other: "Otro",
};

export function EventHero({ event }: EventHeroProps) {
  // Usar nuevos campos de ubicación si están disponibles, sino usar los antiguos
  const location = [
    event.cityName || event.city,
    event.provinceName || event.province,
    event.countryName || event.country,
  ]
    .filter(Boolean)
    .join(", ");

  const dateText = event.startDate
    ? event.endDate && event.endDate !== event.startDate
      ? `${formatDate(event.startDate)} - ${formatDate(event.endDate)}`
      : formatDate(event.startDate)
    : "Fecha por confirmar";

  return (
    <div className="border-b border-border bg-gradient-to-br from-zaltyko-primary-light/30 via-zaltyko-primary-light/20 to-transparent py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          {/* Imagen */}
          <div className="flex h-48 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-card shadow-sm md:h-64 md:w-64">
            {event.images && event.images.length > 0 ? (
              <Image
                src={event.images[0]}
                alt={event.title}
                width={256}
                height={256}
                className="h-full w-full object-cover"
              />
            ) : (
              <Calendar className="h-20 w-20 text-zaltyko-primary" />
            )}
          </div>

          {/* Información */}
          <div className="flex-1">
            <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
              {event.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-zaltyko-primary/30 bg-zaltyko-primary/10 px-4 py-1.5 text-sm font-medium text-zaltyko-primary">
                {EVENT_LEVEL_LABELS[event.level] || event.level}
              </span>

              {event.eventType && (
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-1.5 text-sm font-medium text-foreground">
                  {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                </span>
              )}

              {event.discipline && (
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-1.5 text-sm font-medium text-foreground">
                  {EVENT_DISCIPLINE_LABELS[event.discipline] || event.discipline}
                </span>
              )}

              {dateText && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{dateText}</span>
                </div>
              )}

              {location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{location}</span>
                </div>
              )}

              {event.academyName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{event.academyName}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

