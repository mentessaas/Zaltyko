"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Calendar, MapPin, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortDateForCountry } from "@/lib/date-utils";

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
    <div className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Próximos eventos
            </p>
            <h3 className="text-lg font-semibold text-foreground">
              {events.length} {events.length === 1 ? "evento" : "eventos"}
            </h3>
          </div>
        </div>
        {events.length > 0 && (
          <Link
            href={`/app/${academyId}/events`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition hover:underline"
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
              className="group flex flex-col gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm transition-all hover:border-primary/30 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground transition-colors group-hover:text-primary">{event.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
                    <div className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1",
                      isToday || isTomorrow ? "bg-rose-100 text-rose-700" : "bg-muted text-foreground"
                    )}>
                      <Calendar className="h-3.5 w-3.5" />
                      {isToday
                        ? "Hoy"
                        : isTomorrow
                        ? "Mañana"
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
