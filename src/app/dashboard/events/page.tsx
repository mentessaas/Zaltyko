import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and, desc, inArray } from "drizzle-orm";
import { Calendar, CalendarClock, CalendarCheck, Globe, Trophy } from "lucide-react";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { events, academies, memberships } from "@/db/schema";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/ui/stats-card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/shared/EmptyState";

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

  let currentProfile;
  try {
    currentProfile = await getCurrentProfile(user.id);
  } catch (error) {
    console.error("Error getting profile:", error);
    redirect("/onboarding");
  }

  if (!currentProfile) {
    redirect("/dashboard");
  }

  // Obtener academias del usuario
  const userAcademies = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
    })
    .from(memberships)
    .innerJoin(academies, eq(memberships.academyId, academies.id))
    .where(eq(memberships.userId, currentProfile.userId));

  // Get tenantId from profile or from user's academies
  const effectiveTenantId = currentProfile.tenantId ?? userAcademies[0]?.tenantId;

  if (!effectiveTenantId) {
    redirect("/dashboard");
  }

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
      eq(events.tenantId, effectiveTenantId),
      inArray(events.academyId, academyIds)
    ))
    .orderBy(desc(events.startDate), desc(events.createdAt)) : [];

  // Calculate stats
  const now = new Date();
  const upcomingEvents = eventRows.filter(e => e.startDate && new Date(e.startDate) >= now).length;
  const pastEvents = eventRows.filter(e => e.startDate && new Date(e.startDate) < now).length;
  const publicEvents = eventRows.filter(e => e.isPublic).length;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Eventos" },
        ]}
        title="Eventos"
        description="Crea y gestiona eventos y competencias para tus academias."
        icon={Trophy}
        actions={
          <Button asChild>
            <Link href="/dashboard/events/new">
              <Calendar className="h-4 w-4 mr-2" />
              Nuevo evento
            </Link>
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total"
          value={eventRows.length}
          icon={Calendar}
          variant="default"
        />
        <StatsCard
          title="Próximos"
          value={upcomingEvents}
          icon={CalendarClock}
          variant="success"
        />
        <StatsCard
          title="Pasados"
          value={pastEvents}
          icon={CalendarCheck}
          variant="warning"
        />
        <StatsCard
          title="Públicos"
          value={publicEvents}
          icon={Globe}
          variant="info"
        />
      </div>

      {eventRows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No hay eventos"
          description="Aún no has creado ningún evento. Crea tu primer evento para gestionar competencias y actividades."
          action={{ label: "Crear evento", href: "/dashboard/events/new" }}
        />
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

