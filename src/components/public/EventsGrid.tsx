"use client";

import { EventCard } from "./EventCard";
import type { PublicEvent } from "@/types/events";

interface EventsGridProps {
  events: PublicEvent[];
  isLoading?: boolean;
}

export function EventsGrid({ events, isLoading }: EventsGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-96 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-16 text-center shadow-sm">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-muted">
              <svg
                className="h-10 w-10 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
          <h3 className="text-xl font-semibold text-foreground">
            No se encontraron eventos
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Intenta ajustar los filtros de búsqueda o explora todos los eventos disponibles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

