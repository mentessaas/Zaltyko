import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { events, academies } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { EventsList } from "@/components/events/EventsList";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function EventsPage({ params }: PageProps) {
  const { academyId } = params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Obtener academia con tenantId
  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      country: academies.country,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    redirect("/dashboard");
  }

  // Obtener eventos de la academia filtrando por tenantId
  let eventRows: {
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    country: string | null;
    province: string | null;
    city: string | null;
    level: string;
    discipline: string | null;
    isPublic: boolean | null;
    academyId: string;
  }[] = [];
  try {
    eventRows = await db
      .select({
        id: events.id,
        title: events.title,
        startDate: events.startDate,
        endDate: events.endDate,
        country: events.country,
        province: events.province,
        city: events.city,
        level: events.level,
        discipline: events.discipline,
        isPublic: events.isPublic,
        academyId: events.academyId,
      })
      .from(events)
      .where(and(eq(events.academyId, academyId), eq(events.tenantId, academy.tenantId)));
  } catch (error: any) {
    console.error("Error fetching events:", error);
    // Si hay un error, probablemente la tabla no existe o no tiene la estructura correcta
    // Retornar array vacío por ahora
    eventRows = [];
  }

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
          date: event.startDate ? String(event.startDate) : null,
          location: [event.city, event.province, event.country].filter(Boolean).join(", ") || null,
          status: event.isPublic ? "public" : "private",
          academyId: event.academyId,
        }))}
        academyCountry={academy?.country ?? null}
      />
    </div>
  );
}

