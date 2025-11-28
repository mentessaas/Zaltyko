import Image from "next/image";
import Link from "next/link";
import { MapPin, Calendar, Users } from "lucide-react";

import type { PublicEvent } from "@/types/events";

interface EventCardProps {
  event: PublicEvent;
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

const EVENT_TYPE_LABELS: Record<string, string> = {
  competitions: "Competición",
  courses: "Curso",
  camps: "Campamento",
  workshops: "Taller",
  clinics: "Clínica",
  evaluations: "Evaluación",
  other: "Otro",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Fecha por confirmar";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function EventCard({ event }: EventCardProps) {
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
    <Link
      href={`/events/${event.id}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card p-6 shadow-lg transition-all duration-300 hover:border-zaltyko-primary/50 hover:shadow-xl hover:shadow-zaltyko-primary/10"
    >
      {/* Imagen o placeholder */}
      <div className="mb-4 flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted shadow-sm transition-all group-hover:scale-105 group-hover:border-zaltyko-primary/50">
        {event.images && event.images.length > 0 ? (
          <Image
            src={event.images[0]}
            alt={event.title}
            width={400}
            height={128}
            className="h-full w-full object-cover"
          />
        ) : (
          <Calendar className="h-12 w-12 text-zaltyko-primary" />
        )}
      </div>

      {/* Título */}
      <h3 className="mb-2 font-display text-xl font-semibold text-foreground transition-colors group-hover:text-zaltyko-primary">
        {event.title}
      </h3>

      {/* Badges */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-block w-fit rounded-full border border-zaltyko-primary/30 bg-zaltyko-primary/10 px-3 py-1 text-xs font-medium text-zaltyko-primary">
          {EVENT_LEVEL_LABELS[event.level] || event.level}
        </span>
        {event.eventType && (
          <span className="inline-block w-fit rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
            {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
          </span>
        )}
        {event.discipline && (
          <span className="inline-block w-fit rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
            {EVENT_DISCIPLINE_LABELS[event.discipline] || event.discipline}
          </span>
        )}
      </div>

      {/* Fecha */}
      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4 shrink-0 text-zaltyko-primary/70" />
        <span>{dateText}</span>
      </div>

      {/* Ubicación */}
      {location && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0 text-zaltyko-primary/70" />
          <span className="line-clamp-1">{location}</span>
        </div>
      )}

      {/* Academia organizadora */}
      {event.academyName && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 shrink-0 text-zaltyko-primary/70" />
          <span className="line-clamp-1">{event.academyName}</span>
        </div>
      )}

      {/* Descripción (truncada) */}
      {event.description && (
        <p className="mt-auto line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {event.description}
        </p>
      )}

      {/* Botón de acción */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-zaltyko-primary">
          Ver detalles
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted transition-all group-hover:border-zaltyko-primary/50 group-hover:bg-zaltyko-primary/10">
          <svg
            className="h-4 w-4 text-muted-foreground transition-all group-hover:text-zaltyko-primary group-hover:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
}

