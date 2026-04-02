"use client";

import Link from "next/link";
import { CalendarDays, ArrowRight } from "lucide-react";
import EventCard from "./EventCard";
import type { PublicEvent } from "@/lib/seo/clusters";

interface ClusterEventsSectionProps {
  events: PublicEvent[];
  locale: "es" | "en";
  modalityLabel: string;
  countryLabel: string;
}

export default function ClusterEventsSection({
  events,
  locale,
  modalityLabel,
  countryLabel,
}: ClusterEventsSectionProps) {
  const labels = {
    es: {
      title: "Eventos y competiciones",
      subtitle: `Proximos eventos de ${modalityLabel} en ${countryLabel}`,
      cta: "Ver todos los eventos",
      empty: "No hay eventos proximos en esta region todavia",
    },
    en: {
      title: "Events and competitions",
      subtitle: `Upcoming ${modalityLabel} events in ${countryLabel}`,
      cta: "View all events",
      empty: "No upcoming events in this region yet",
    },
  };

  const t = labels[locale];

  if (events.length === 0) {
    return null;
  }

  return (
    <section className="py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-amber-600" />
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-gray-900">
                {t.title}
              </h2>
            </div>
            <p className="text-lg text-gray-600 max-w-xl">{t.subtitle}</p>
          </div>
          <Link
            href={`/${locale}/events`}
            className="hidden sm:flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
          >
            {t.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {events.slice(0, 8).map((event) => (
            <EventCard key={event.id} event={event} locale={locale} />
          ))}
        </div>

        {/* Mobile CTA */}
        <div className="sm:hidden mt-8 text-center">
          <Link
            href={`/${locale}/events`}
            className="inline-flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
          >
            {t.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
