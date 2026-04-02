"use client";

import Link from "next/link";
import { Calendar, MapPin, Users, Ticket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicEvent } from "@/lib/seo/clusters";

interface EventCardProps {
  event: PublicEvent;
  locale: "es" | "en";
}

export default function EventCard({ event, locale }: EventCardProps) {
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

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === "es" ? "es-ES" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

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
    <Card className="group h-full overflow-hidden border border-gray-100 bg-white transition-all duration-300 hover:shadow-lg hover:border-amber-100 hover:-translate-y-1">
      <CardContent className="p-5">
        {/* Date Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(event.startDate)}</span>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
            {event.level ? (levelLabels[event.level] || event.level) : event.level}
          </span>
        </div>

        {/* Title and Academy */}
        <h3 className="font-semibold text-gray-900 text-lg leading-tight mb-2 group-hover:text-amber-700 transition-colors">
          {event.title}
        </h3>
        <p className="text-sm text-amber-600 font-medium mb-3">
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
          <div className="flex items-center gap-1.5 text-sm font-medium text-green-600">
            <Ticket className="h-4 w-4" />
            <span>
              {event.registrationFee === 0 || event.registrationFee === null || event.registrationFee === undefined
                ? t.free
                : `$${((event.registrationFee ?? 0) / 100).toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* CTA */}
        <Link
          href={`/events/${event.id}`}
          className="inline-flex items-center text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
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
}
