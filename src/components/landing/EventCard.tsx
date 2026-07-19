"use client";

import { memo } from "react";
import Link from "next/link";
import { Calendar, MapPin, Users, Ticket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicEvent } from "@/lib/seo/clusters";

interface EventCardProps {
  event: PublicEvent;
  locale: "es" | "en";
}

const EventCard = memo(function EventCard({ event, locale }: EventCardProps) {
  const labels = {
    es: {
      register: "Registrarse",
      spotsLeft: " plazas",
      free: "Gratis",
      level: "Nivel",
      viewDetails: "Ver detalles",
    },
    en: {
      register: "Register",
      spotsLeft: " spots",
      free: "Free",
      level: "Level",
      viewDetails: "View details",
    },
  };

  const t = labels[locale];

  const dateParts = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const loc = locale === "es" ? "es-ES" : "en-US";
    return {
      day: date.toLocaleDateString(loc, { day: "numeric" }),
      month: date.toLocaleDateString(loc, { month: "short" }).replace(".", ""),
      year: date.toLocaleDateString(loc, { year: "numeric" }),
    };
  };

  const eventDate = dateParts(event.startDate);

  const levelLabels: Record<string, string> = {
    internal: locale === "es" ? "Interno" : "Internal",
    local: locale === "es" ? "Local" : "Local",
    national: locale === "es" ? "Nacional" : "National",
    international: locale === "es" ? "Internacional" : "International",
  };

  const location = [event.cityName, event.provinceName, event.countryName]
    .filter(Boolean)
    .join(", ");

  return (
    <Card className="group card-hover h-full overflow-hidden border border-gray-100 bg-white hover:border-zaltyko-coral/30">
      <CardContent className="p-5">
        {/* Date tile + level */}
        <div className="flex items-start justify-between mb-4">
          {eventDate ? (
            <div className="flex w-14 flex-col items-center justify-center rounded-control bg-zaltyko-coral/10 px-2 py-2 leading-none">
              <span className="text-xl font-bold text-zaltyko-coral">{eventDate.day}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zaltyko-coral/80">{eventDate.month}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="h-4 w-4" />
            </div>
          )}
          {event.level && (
            <span className="px-2.5 py-1 rounded-full bg-zaltyko-coral/10 text-zaltyko-coral text-xs font-medium">
              {levelLabels[event.level] || event.level}
            </span>
          )}
        </div>

        {/* Title and Academy */}
        <h3 className="font-semibold text-gray-900 text-lg leading-tight mb-2 group-hover:text-zaltyko-coral transition-colors">
          {event.title}
        </h3>
        <p className="text-sm text-zaltyko-coral font-medium mb-3">
          {event.academyName}
        </p>

        {/* Description */}
        {event.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-4">
            {event.description}
          </p>
        )}

        {/* Location */}
        {location && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{location}</span>
          </div>
        )}

        {/* Capacity and Fee */}
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-100">
          {event.maxCapacity && (
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <Users className="h-4 w-4" />
              <span>
                {event.maxCapacity}
                {t.spotsLeft}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-sm font-medium text-zaltyko-teal">
            <Ticket className="h-4 w-4" />
            <span>
              {event.registrationFee === 0 || event.registrationFee === null || event.registrationFee === undefined
                ? t.free
                : `${((event.registrationFee ?? 0) / 100).toFixed(2)}€`}
            </span>
          </div>
        </div>

        {/* CTA */}
        <Link
          href={`/events/${event.id}`}
          className="inline-flex items-center text-sm font-medium text-zaltyko-coral hover:text-orange-600 transition-colors"
        >
          {t.register}
          <svg
            className="ml-1 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      </CardContent>
    </Card>
  );
});

export default EventCard;
