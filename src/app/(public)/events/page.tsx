import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EventsFilters } from "@/components/public/EventsFilters";
import { EventsGrid } from "@/components/public/EventsGrid";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";

export const metadata: Metadata = {
  title: "Eventos y Competiciones de Gimnasia | Zaltyko",
  description: "Encuentra eventos y competencias de gimnasia cerca de ti. Directorio público de eventos y competiciones.",
  openGraph: {
    title: "Eventos y Competiciones de Gimnasia | Zaltyko",
    description: "Encuentra eventos y competencias de gimnasia cerca de ti",
    url: "/events",
    type: "website",
  },
};

async function getEvents() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/public/events?limit=50`,
    { cache: "no-store" }
  );
  if (!res.ok) return { events: [], total: 0 };
  return res.json();
}

function EventsContent({ events }: { events: any[] }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
      <aside>
        <EventsFilters />
      </aside>

      <main>
        {events.length > 0 ? (
          <EventsGrid events={events} />
        ) : (
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
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="mb-2 text-xl font-semibold">
                No hay eventos públicos todavía
              </h3>
              <p className="text-muted-foreground">
                Las academias pueden publicar sus eventos y competiciones desde su panel de gestión.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default async function EventsPage() {
  const { events } = await getEvents();

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card py-8">
        <div className="container mx-auto px-4">
          <PublicPageHeader
            title="Eventos y Competiciones"
            publishHref="/dashboard/events/new"
            publishLabel="Crear evento"
            dashboardHref="/dashboard/events"
            dashboardLabel="Mis eventos"
          />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Suspense fallback={<div className="container mx-auto px-4 py-8">Cargando...</div>}>
          <EventsContent events={events} />
        </Suspense>
      </div>
    </div>
  );
}
