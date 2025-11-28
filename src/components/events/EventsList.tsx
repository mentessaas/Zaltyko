"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, MapPin, Plus, Edit, Trash2, Mail } from "lucide-react";
import Link from "next/link";
import { formatLongDateForCountry } from "@/lib/date-utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EventForm } from "./EventForm";

interface Event {
  id: string;
  title: string;
  date: string | null;
  location: string | null;
  status: string | null;
  academyId: string;
}

interface EventsListProps {
  academyId: string;
  events: Event[];
  academyCountry?: string | null;
}

export function EventsList({ academyId, events, academyCountry }: EventsListProps) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  const handleDelete = async (eventId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este evento?")) {
      return;
    }

    setDeletingEventId(eventId);
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
        credentials: "include", // Incluir cookies para autenticación
      });

      if (!response.ok) {
        throw new Error("Error al eliminar evento");
      }

      router.refresh();
    } catch (error) {
      console.error("Error deleting event:", error);
      alert("Error al eliminar el evento");
    } finally {
      setDeletingEventId(null);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "published":
        return <Badge className="bg-green-100 text-green-800">Publicado</Badge>;
      case "draft":
        return <Badge className="bg-gray-100 text-gray-800">Borrador</Badge>;
      case "cancelled":
        return <Badge className="bg-red-100 text-red-800">Cancelado</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">Borrador</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Eventos</h2>
          <p className="text-muted-foreground mt-1">
            Gestiona los eventos y competencias de tu academia
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Crear evento
        </Button>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center mb-4">
              No hay eventos creados aún
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear primer evento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <Card key={event.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{event.title}</CardTitle>
                  {getStatusBadge(event.status)}
                </div>
                {event.date && (
                  <CardDescription className="flex items-center gap-2 mt-2">
                    <Calendar className="h-4 w-4" />
                    {formatLongDateForCountry(event.date, academyCountry)}
                  </CardDescription>
                )}
                {event.location && (
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <MapPin className="h-4 w-4" />
                    {event.location}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <Link href={`/app/${academyId}/events/${event.id}`}>
                      Ver detalles
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingEvent(event)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(event.id)}
                    disabled={deletingEventId === event.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EventForm
        academyId={academyId}
        open={isCreateOpen || editingEvent !== null}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingEvent(null);
        }}
        event={editingEvent || undefined}
        onSaved={() => {
          setIsCreateOpen(false);
          setEditingEvent(null);
          router.refresh();
        }}
      />
    </div>
  );
}

