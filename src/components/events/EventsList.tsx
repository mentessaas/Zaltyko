"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, MapPin, Plus, Edit, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatLongDateForCountry } from "@/lib/date-utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EventForm } from "./EventForm";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { useToast } from "@/components/ui/toast-provider";

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
  const { specialization } = useAcademyContext();
  const toast = useToast();
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
      toast.pushToast({
        title: "No se pudo eliminar el evento",
        description: "Inténtalo de nuevo en unos segundos.",
        variant: "error",
      });
    } finally {
      setDeletingEventId(null);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "published":
      case "public":
        return <Badge variant="active">Publicado</Badge>;
      case "draft":
      case "private":
        return <Badge variant="outline">Borrador</Badge>;
      case "cancelled":
        return <Badge variant="error">Cancelado</Badge>;
      default:
        return <Badge variant="outline">Borrador</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-zaltyko-mist bg-white p-6 shadow-soft">
        <div className="zaltyko-motion-lines pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-teal">Eventos</p>
            <h2 className="font-display text-3xl font-semibold text-zaltyko-navy">Agenda de academia</h2>
            <p className="mt-1 text-sm text-zaltyko-text-secondary">
              Gestiona competiciones, evaluaciones y citas clave de {specialization.labels.disciplineName.toLowerCase()}
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Crear evento
          </Button>
        </div>
      </div>

      {events.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="mb-4 h-12 w-12 text-zaltyko-teal" />
            <p className="mb-4 text-center text-sm text-zaltyko-text-secondary">
              Aún no hay eventos. Empieza añadiendo uno.
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
            <Card key={event.id} className="transition hover:border-zaltyko-teal/40">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{event.title}</CardTitle>
                  {getStatusBadge(event.status)}
                </div>
                {event.date && (
                  <CardDescription className="mt-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatLongDateForCountry(event.date, academyCountry)}
                  </CardDescription>
                )}
                {event.location && (
                  <CardDescription className="mt-1 flex items-center gap-2">
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
                    className="border-zaltyko-coral/30 text-zaltyko-coral hover:bg-zaltyko-coral/10"
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
