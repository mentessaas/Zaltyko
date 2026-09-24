import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import { EventsFilters } from "@/components/public/EventsFilters";
import { EventsGrid } from "@/components/public/EventsGrid";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import Reveal from "@/components/motion/Reveal";
import { getPublicEvents } from "@/app/actions/public/get-public-events";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import type { EventFilters } from "@/types/events";

export const metadata: Metadata = {
  title: "Eventos y Competiciones de Gimnasia",
  description: "Encuentra eventos y competencias de gimnasia cerca de ti. Directorio público de eventos y competiciones.",
  alternates: {
    canonical: `${getPublicSiteUrl()}/events`,
  },
  openGraph: {
    title: "Eventos y Competiciones de Gimnasia",
    description: "Encuentra eventos y competencias de gimnasia cerca de ti",
    url: `${getPublicSiteUrl()}/events`,
    type: "website",
  },
};

interface EventsSearchParams {
  search?: string;
  discipline?: string;
  level?: string;
  eventType?: string;
  country?: string;
  province?: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  page?: string;
}

async function getEvents(searchParams: EventsSearchParams) {
  try {
    const filters = {
      ...searchParams,
      page: Math.max(1, Number(searchParams.page) || 1),
      limit: 50,
    } as EventFilters;
    const result = await getPublicEvents(filters);
    return result.items;
  } catch {
    return [];
  }
}

function EventsContent({ events }: { events: Awaited<ReturnType<typeof getEvents>> }) {
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
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
      <aside>
        <EventsFilters />
      </aside>

      <main>
        <EventsGrid events={events} />
      </main>
    </div>
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<EventsSearchParams>;
}) {
  const events = await getEvents(await searchParams);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card py-8">
        <div className="container mx-auto px-4">
          <PublicPageHeader
            title="Eventos y Competiciones"
            publishHref="/dashboard/events/new"
            publishHrefTemplate="/app/{academyId}/events"
            publishLabel="Crear evento"
            dashboardHref="/dashboard/events"
            dashboardHrefTemplate="/app/{academyId}/events"
            dashboardLabel="Mis eventos"
          />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Reveal>
          <EventsContent events={events} />
        </Reveal>
      </div>
    </div>
  );
}
