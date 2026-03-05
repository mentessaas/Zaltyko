"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Calendar, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatShortDateForCountry, isSameDayInTimezone, getTodayInCountryTimezone } from "@/lib/date-utils";

interface Event {
  id: string;
  title: string;
  date: string | null;
  location: string | null;
  status: string | null;
  academyId: string;
  createdAt: string | null;
}

interface UpcomingEventsWidgetProps {
  academyId: string;
  academyCountry?: string | null;
}

export function UpcomingEventsWidget({ academyId, academyCountry }: UpcomingEventsWidgetProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, [academyId]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/events?academyId=${academyId}`);
      if (response.ok) {
        const data = await response.json();
        const allEvents = Array.isArray(data.items) ? data.items : [];
        // Filtrar solo eventos futuros y ordenar por fecha según zona horaria del país
        const { getNowInCountryTimezone } = await import("@/lib/date-utils");
        const now = getNowInCountryTimezone(academyCountry);
        const upcoming = allEvents
          .filter((e: Event) => e.date && new Date(e.date) >= now)
          .sort((a: Event, b: Event) => {
            if (!a.date || !b.date) return 0;
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          })
          .slice(0, 5);
        setEvents(upcoming);
      }
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-zaltyko-border/40 bg-gradient-to-br from-white via-white to-purple-50/50 p-6 shadow-lg shadow-purple-500/10">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-purple-600/80">
              Proximos eventos
            </p>
            <h3 className="text-lg font-bold text-zaltyko-text-main">
              {events.length} {events.length === 1 ? "evento" : "eventos"}
            </h3>
          </div>
        </div>
        {events.length > 0 && (
          <Link
            href={`/app/${academyId}/events`}
            className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 transition hover:underline"
          >
            Ver todos
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </header>

      <div className="space-y-3">
        {events.map((event) => {
          if (!event.date) return null;
          const { isSameDayInTimezone, getTodayInCountryTimezone } = require("@/lib/date-utils");
          const today = getTodayInCountryTimezone(academyCountry);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const isToday = isSameDayInTimezone(event.date, today, academyCountry);
          const isTomorrow = isSameDayInTimezone(event.date, tomorrow, academyCountry);

          return (
            <Link
              key={event.id}
              href={`/app/${academyId}/events/${event.id}`}
              className="group flex flex-col gap-2 rounded-2xl border border-zaltyko-border/30 bg-white/80 px-4 py-3 text-sm transition-all hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zaltyko-text-main group-hover:text-purple-600 transition-colors">{event.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-zaltyko-text-secondary">
                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg",
                      isToday ? "bg-purple-100 text-purple-700" :
                      isTomorrow ? "bg-violet-100 text-violet-700" :
                      "bg-zaltyko-bg"
                    )}>
                      <Calendar className="h-3.5 w-3.5" />
                      {isToday
                        ? "Hoy"
                        : isTomorrow
                        ? "Manana"
                        : formatShortDateForCountry(event.date, academyCountry)}
                    </div>
                    {event.location && (
                      <div className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

