import type { Metadata } from "next";
import { EventsFilters } from "@/components/public/EventsFilters";
import { EventsGrid } from "@/components/public/EventsGrid";
import { getPublicEvents } from "@/app/actions/public/get-public-events";

export const metadata: Metadata = {
  title: "Directorio de Eventos | Zaltyko",
  description: "Encuentra eventos y competencias de gimnasiacute;a cerca de ti. Directorio público de eventos de gimnasiacute;artística, rítmica, trampolín y más.",
};

interface EventsPageProps {
  searchParams: Promise<{
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
  }>;
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const params = await searchParams;
  
  const page = Number(params.page) || 1;
  
  // Wrap in try-catch to handle errors gracefully
  let result;
  try {
    result = await getPublicEvents({
      search: params.search,
      discipline: params.discipline as any,
      level: params.level as any,
      eventType: params.eventType as any,
      country: params.country,
      province: params.province,
      city: params.city,
      startDate: params.startDate,
      endDate: params.endDate,
      page,
      limit: 50,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    // Return empty result on error
    result = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    };
  }
  
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card py-8">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold">Eventos y Competiciones</h1>
          <p className="mt-2 text-muted-foreground">
            Encuentra eventos de gimnasiacute;en tu zona
          </p>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
          <aside>
            <EventsFilters />
          </aside>
          
          <main>
            {result.total > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {result.total} evento{result.total !== 1 ? 's' : ''} encontrado{result.total !== 1 ? 's' : ''}
                </p>
                <EventsGrid events={result.items} />
              </div>
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
                    Las academias están añadiendo eventos. Vuelve pronto o
                    contacta con nosotros para añadir el tuyo.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
