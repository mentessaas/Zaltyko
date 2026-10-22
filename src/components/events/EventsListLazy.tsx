"use client";

import dynamic from "next/dynamic";

/**
 * Wrapper lazy de EventsList. Code-split el bundle de eventos para que
 * no se cargue en el segmento dashboard.
 */
const EventsList = dynamic(
  () => import("@/components/events/EventsList").then((m) => ({ default: m.EventsList })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Cargando eventos">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 bg-muted rounded-xl" />
        ))}
      </div>
    ),
  }
);

export function EventsListLazy(props: React.ComponentProps<typeof EventsList>) {
  return <EventsList {...props} />;
}