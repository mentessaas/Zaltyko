import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventHero } from "@/components/public/EventHero";
import { EventInfo } from "@/components/public/EventInfo";
import { EventContact } from "@/components/public/EventContact";
import { ShareButton } from "@/components/public/ShareButton";
import { getPublicEvent } from "@/app/actions/public/get-public-event";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { eventJsonLd } from "@/lib/seo/event-schema";
import { Schema } from "@/components/Schema";

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getPublicEvent(id);

  if (!event) {
    return {
      title: "Evento no encontrado",
    };
  }

  return {
    title: `${event.title} | Directorio de Eventos`,
    description: event.description || `Información sobre ${event.title}`,
    alternates: {
      canonical: `${getPublicSiteUrl()}/events/${id}`,
    },
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;
  const event = await getPublicEvent(id);

  if (!event) {
    notFound();
  }

  const baseUrl = getPublicSiteUrl();
  const eventSchema = eventJsonLd({
    baseUrl,
    pagePath: `/events/${id}`,
    title: event.title,
    description: event.description,
    startDate: event.startDate ?? null,
    endDate: event.endDate ?? null,
    cityName: event.cityName ?? event.city ?? null,
    provinceName: event.provinceName ?? event.province ?? null,
    countryName: event.countryName ?? event.country ?? null,
    organizerName: event.academyName || undefined,
    organizerUrl: event.academy ? `${baseUrl}/academias/${event.academy.id}` : undefined,
    registrationEndDate: event.registrationEndDate ?? null,
  });

  return (
    <div className="min-h-screen bg-background">
      <EventHero event={event} />
      <EventInfo event={event} />

      {/* Sección de contacto */}
      <section className="border-b border-border py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-foreground">
                ¿Interesado en este evento?
              </h2>
              <ShareButton eventId={event.id} eventTitle={event.title} />
            </div>
            <p className="mb-6 text-muted-foreground">
              Contacta con los organizadores para más información sobre el evento, inscripciones y disponibilidad.
            </p>
            <EventContact
              eventId={event.id}
              eventTitle={event.title}
              contactEmail={event.contactEmail}
            />
          </div>
        </div>
      </section>

      {eventSchema && <Schema json={eventSchema} />}
    </div>
  );
}
