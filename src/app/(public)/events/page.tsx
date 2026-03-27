import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import { desc, eq } from "drizzle-orm";
import { EventsFilters } from "@/components/public/EventsFilters";
import { EventsGrid } from "@/components/public/EventsGrid";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { db } from "@/db";
import { events, academies } from "@/db/schema";

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
  try {
    const eventItems = await db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        category: events.category,
        level: events.level,
        discipline: events.discipline,
        eventType: events.eventType,
        startDate: events.startDate,
        endDate: events.endDate,
        registrationStartDate: events.registrationStartDate,
        registrationEndDate: events.registrationEndDate,
        countryCode: events.countryCode,
        countryName: events.countryName,
        provinceName: events.provinceName,
        cityName: events.cityName,
        contactEmail: events.contactEmail,
        contactPhone: events.contactPhone,
        contactInstagram: events.contactInstagram,
        contactWebsite: events.contactWebsite,
        images: events.images,
        academyId: events.academyId,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(eq(events.isPublic, true))
      .orderBy(desc(events.startDate), desc(events.createdAt))
      .limit(50);

    const academyIds = Array.from(new Set(eventItems.map(e => e.academyId)));
    const academyData = academyIds.length > 0 ? await db
      .select({ id: academies.id, name: academies.name, logoUrl: academies.logoUrl })
      .from(academies)
      .then(rows => new Map(rows.map(a => [a.id, a])))
      : new Map();

    return eventItems.map(event => ({
      ...event,
      academyName: academyData.get(event.academyId)?.name || null,
      academyLogoUrl: academyData.get(event.academyId)?.logoUrl || null,
    }));
  } catch {
    return [];
  }
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
  const events = await getEvents();

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
        <EventsContent events={events} />
      </div>
    </div>
  );
}
