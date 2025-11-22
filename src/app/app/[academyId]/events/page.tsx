import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { EventsList } from "@/components/events/EventsList";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function EventsPage({ params }: PageProps) {
  const { academyId } = params;

  // Obtener tenantId desde la academia
  const [academy] = await db
    .select({
      tenantId: events.tenantId,
    })
    .from(events)
    .where(eq(events.academyId, academyId))
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
      <EventsList
        academyId={academyId}
        events={eventRows.map((event) => ({
          id: event.id,
          title: event.title,
          date: event.date?.toISOString().split("T")[0] || null,
          location: event.location,
          status: event.status,
          academyId: event.academyId,
        }))}
        onEventUpdated={() => {
          // Recargar la página
        }}
      />
    </div>
  );
}

