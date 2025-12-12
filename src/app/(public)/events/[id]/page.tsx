import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventHero } from "@/components/public/EventHero";
import { EventInfo } from "@/components/public/EventInfo";
import { EventContact } from "@/components/public/EventContact";
import { ShareButton } from "@/components/public/ShareButton";
import { getPublicEvent } from "@/app/actions/public/get-public-event";

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getPublicEvent(id);

  if (!event) {
    return {
      title: "Evento no encontrado | Zaltyko",
    };
  }

  return {
    title: `${event.title} | Directorio de Eventos | Zaltyko`,
    description: event.description || `Información sobre ${event.title}`,
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;
  const event = await getPublicEvent(id);

  if (!event) {
    notFound();
  }

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
    </div>
  );
}

