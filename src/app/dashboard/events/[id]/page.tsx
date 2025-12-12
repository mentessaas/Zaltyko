import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { events, academies } from "@/db/schema";
import { EventForm } from "@/components/events/EventForm";
import { EventNotifications } from "@/components/events/EventNotifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EVENT_LEVEL_LABELS: Record<string, string> = {
  internal: "Interno",
  local: "Local",
  national: "Nacional",
  international: "Internacional",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const currentProfile = await getCurrentProfile(user.id);

  if (!currentProfile || !currentProfile.tenantId) {
    redirect("/dashboard");
  }

  // Obtener evento
  const [event] = await db
    .select({
      id: events.id,
      academyId: events.academyId,
      title: events.title,
      description: events.description,
      category: events.category,
      isPublic: events.isPublic,
      level: events.level,
      discipline: events.discipline,
      startDate: events.startDate,
      endDate: events.endDate,
      country: events.country,
      province: events.province,
      city: events.city,
      contactEmail: events.contactEmail,
      contactPhone: events.contactPhone,
      contactInstagram: events.contactInstagram,
      contactWebsite: events.contactWebsite,
      tenantId: events.tenantId,
    })
    .from(events)
    .where(and(eq(events.id, id), eq(events.tenantId, currentProfile.tenantId)))
    .limit(1);

  if (!event) {
    notFound();
  }

  // Verificar que la academia pertenece al tenant
  const [academy] = await db
    .select({ tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, event.academyId))
    .limit(1);

  if (!academy || academy.tenantId !== currentProfile.tenantId) {
    notFound();
  }

  const handleDelete = async () => {
    "use server";
    const response = await fetch(`/api/events/${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      redirect("/dashboard/events");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zaltyko-primary uppercase tracking-wide">Eventos</p>
          <h1 className="text-3xl font-bold text-zaltyko-neutral-dark">{event.title}</h1>
          <p className="text-muted-foreground">
            Gestiona los detalles y notificaciones del evento.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/dashboard/events">Volver a eventos</Link>
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Formulario de edición */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Editar evento</CardTitle>
            </CardHeader>
            <CardContent>
              <EventForm
                academyId={event.academyId}
                eventId={event.id}
                initialData={{
                  title: event.title || undefined,
                  description: event.description || undefined,
                  category: event.category || undefined,
                  isPublic: event.isPublic,
                  level: String(event.level),
                  discipline: event.discipline ? String(event.discipline) : undefined,
                  startDate: event.startDate ? String(event.startDate) : undefined,
                  endDate: event.endDate ? String(event.endDate) : undefined,
                  country: event.country || undefined,
                  province: event.province || undefined,
                  city: event.city || undefined,
                  contactEmail: event.contactEmail || undefined,
                  contactPhone: event.contactPhone || undefined,
                  contactInstagram: event.contactInstagram || undefined,
                  contactWebsite: event.contactWebsite || undefined,
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Notificaciones */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Notificaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <EventNotifications eventId={event.id} academyId={event.academyId} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

