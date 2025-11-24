import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { events, academies } from "@/db/schema";
import { EventsList } from "@/components/events/EventsList";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function EventsPage({ params }: PageProps) {
  const { academyId } = params;

  // Obtener país de la academia
  const [academy] = await db
    .select({
      country: academies.country,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  // Si no hay eventos, intentar obtener tenantId de otra forma
  // Por ahora, asumimos que el tenantId se obtiene del contexto de autenticación
  // En producción, esto debería venir del middleware/authz

  const eventRows = await db
    .select({
      id: events.id,
      title: events.title,
      date: events.date,
      location: events.location,
      status: events.status,
      academyId: events.academyId,
    })
    .from(events)
    .where(eq(events.academyId, academyId));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Eventos" },
        ]}
      />
      <EventsList
        academyId={academyId}
        events={eventRows.map((event) => ({
          id: event.id,
          title: event.title,
          date: event.date || null,
          location: event.location,
          status: event.status,
          academyId: event.academyId,
        }))}
        academyCountry={academy?.country ?? null}
      />
    </div>
  );
}

