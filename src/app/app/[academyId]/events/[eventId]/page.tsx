import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { formatLongDateForCountry } from "@/lib/date-utils";
import { Calendar, MapPin, Mail } from "lucide-react";

import { db } from "@/db";
import { events, eventInvitations, academies } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PageProps {
  params: {
    academyId: string;
    eventId: string;
  };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { academyId, eventId } = params;

  const [eventRow] = await db
    .select({
      id: events.id,
      title: events.title,
      startDate: events.startDate,
      endDate: events.endDate,
      country: events.country,
      province: events.province,
      city: events.city,
      isPublic: events.isPublic,
      level: events.level,
      academyId: events.academyId,
      academyCountry: academies.country,
    })
    .from(events)
    .innerJoin(academies, eq(events.academyId, academies.id))
    .where(and(eq(events.id, eventId), eq(events.academyId, academyId)))
    .limit(1);

  if (!eventRow) {
    notFound();
  }

  const invitations = await db
    .select()
    .from(eventInvitations)
    .where(eq(eventInvitations.eventId, eventId));

  const getStatusBadge = (isPublic: boolean) => {
    if (isPublic) {
      return <Badge className="bg-green-100 text-green-800">Público</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">Privado</Badge>;
  };

  const location = [eventRow?.city, eventRow?.province, eventRow?.country]
    .filter(Boolean)
    .join(", ") || null;

  const dateText = eventRow?.startDate
    ? eventRow.endDate && eventRow.endDate !== eventRow.startDate
      ? `${eventRow.startDate} - ${eventRow.endDate}`
      : eventRow.startDate
    : null;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Eventos", href: `/app/${academyId}/events` },
          { label: eventRow.title },
        ]}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{eventRow.title}</h1>
          <p className="text-muted-foreground mt-1">
            Detalles del evento
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/app/${academyId}/events`}>
            Volver a eventos
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Información del evento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Estado:</span>
              {getStatusBadge(eventRow.isPublic)}
            </div>
            {dateText && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {formatLongDateForCountry(dateText, eventRow.academyCountry)}
                </span>
              </div>
            )}
            {location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{location}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invitaciones</CardTitle>
            <CardDescription>
              {invitations.length} invitación(es) enviada(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/app/${academyId}/events/${eventId}/invitations`}>
                <Mail className="mr-2 h-4 w-4" />
                Gestionar invitaciones
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

