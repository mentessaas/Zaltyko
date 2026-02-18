import { Suspense } from "react";
import type { Metadata } from "next";
import { EventsFilters } from "@/components/public/EventsFilters";
import { EventsGrid } from "@/components/public/EventsGrid";

export const metadata: Metadata = {
  title: "Directorio de Eventos | Zaltyko",
  description: "Encuentra eventos y competencias de gimnasiacute;cerca de ti. Directorio público de eventos.",
};

function EventsContent() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
        <aside>
          <EventsFilters />
        </aside>
        
        <main>
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
                Eventos proximamente
              </h3>
              <p className="text-muted-foreground">
                Las academias pueden publicar sus eventos y competiciones pronto.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default async function EventsPage() {
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
      
      <Suspense fallback={<div className="container mx-auto px-4 py-8">Cargando...</div>}>
        <EventsContent />
      </Suspense>
    </div>
  );
}
