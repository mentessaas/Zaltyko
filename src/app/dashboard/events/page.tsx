import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and, desc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { events, academies, memberships } from "@/db/schema";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const EVENT_LEVEL_LABELS: Record<string, string> = {
  internal: "Interno",
  local: "Local",
  national: "Nacional",
  international: "Internacional",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function EventsPage() {
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

  // Obtener academias del usuario
  const userAcademies = await db
    .select({
      id: academies.id,
      name: academies.name,
    })
    .from(memberships)
    .innerJoin(academies, eq(memberships.academyId, academies.id))
    .where(eq(memberships.userId, currentProfile.userId));

  if (userAcademies.length === 0) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-semibold text-zaltyko-primary uppercase tracking-wide">Eventos</p>
          <h1 className="text-3xl font-bold text-zaltyko-neutral-dark">Gestiona tus eventos</h1>
          <p className="text-muted-foreground">
            Crea y gestiona eventos y competencias para tus academias.
          </p>
        </header>
        <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-zaltyko-neutral-dark">No tienes academias asignadas.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Necesitas tener al menos una academia para crear eventos.
          </p>
        </div>
      </div>
    );
  }

  // Obtener eventos de todas las academias del usuario
  const academyIds = userAcademies.map(a => a.id);
  const eventRows = academyIds.length > 0 ? await db
    .select({
      id: events.id,
      title: events.title,
      startDate: events.startDate,
      endDate: events.endDate,
      isPublic: events.isPublic,
      level: events.level,
      academyId: events.academyId,
      academyName: academies.name,
    })
    .from(events)
    .innerJoin(academies, eq(events.academyId, academies.id))
    .where(and(
      eq(events.tenantId, currentProfile.tenantId),
      inArray(events.academyId, academyIds)
    ))
    .orderBy(desc(events.startDate), desc(events.createdAt)) : [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zaltyko-primary uppercase tracking-wide">Eventos</p>
          <h1 className="text-3xl font-bold text-zaltyko-neutral-dark">Gestiona tus eventos</h1>
          <p className="text-muted-foreground">
            Crea y gestiona eventos y competencias para tus academias.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/events/new">Nuevo evento</Link>
        </Button>
      </header>

      {eventRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-zaltyko-neutral-dark">No tienes eventos creados.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea tu primer evento para comenzar.
          </p>
          <Button asChild className="mt-6">
            <Link href="/dashboard/events/new">Crear evento</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {eventRows.map((event) => {
            const dateText = event.startDate
              ? event.endDate && event.endDate !== event.startDate
                ? `${formatDate(event.startDate)} - ${formatDate(event.endDate)}`
                : formatDate(event.startDate)
              : "Fecha por confirmar";

            return (
              <Card key={event.id} className="flex h-full flex-col border border-zaltyko-neutral/20 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-xl font-semibold">{event.title}</CardTitle>
                    {event.isPublic && <Badge variant="active">Público</Badge>}
                  </div>
                  <CardDescription>{event.academyName}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground">
                  <p>
                    <span className="font-semibold text-zaltyko-neutral-dark">Fecha:</span> {dateText}
                  </p>
                  <p>
                    <span className="font-semibold text-zaltyko-neutral-dark">Nivel:</span>{" "}
                    {EVENT_LEVEL_LABELS[String(event.level)] || String(event.level)}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button asChild variant="secondary" className="w-full">
                    <Link href={`/dashboard/events/${event.id}`}>Ver detalles</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

