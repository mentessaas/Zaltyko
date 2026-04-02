"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { formatLongDateForCountry } from "@/lib/date-utils";
import { Calendar, MapPin, Users, Clock, AlertCircle, CheckCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { WaitlistPosition } from "@/components/events/WaitlistPosition";

interface RegistrationFormProps {
  eventId: string;
  academyId: string;
  profileId: string;
}

interface EventDetails {
  id: string;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  registrationStartDate: string | null;
  registrationEndDate: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
  level: string;
  discipline: string | null;
  eventType: string | null;
  status: string;
  maxCapacity: number | null;
  registrationFee: number | null;
  allowWaitlist: boolean;
  waitlistMaxSize: number | null;
  academyName?: string;
  academyCountry?: string | null;
  stats?: {
    totalRegistrations: number;
    confirmedRegistrations: number;
    availableSlots: number | null;
    capacity: number | null;
  };
}

export default function EventRegistrationPage({
  params,
}: {
  params: { academyId: string; eventId: string };
}) {
  const router = useRouter();
  const { academyId, eventId } = params;

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  // Registration state
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<"idle" | "registered" | "waitlisted" | "error">("idle");

  useEffect(() => {
    // Get profile from localStorage or session
    const userProfile = (window as any).__userProfile;
    if (userProfile?.id) {
      setProfileId(userProfile.id);
    }

    // Fetch event details
    const fetchEvent = async () => {
      try {
        const response = await fetch(`/api/events/${eventId}?includeStats=true`, {
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 404) {
            notFound();
          }
          throw new Error("Error al cargar el evento");
        }

        const data = await response.json();
        setEvent(data);

        // Check if already registered
        if (data.registration) {
          setRegistrationStatus(data.registration.status === "waitlisted" ? "waitlisted" : "registered");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [eventId]);

  const handleRegister = async () => {
    if (!profileId) {
      setError("Debes iniciar sesión para registrarte");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profileId, notes: notes || undefined }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Error al registrarte");
      }

      const data = await response.json();
      setRegistrationStatus(data.status === "waitlisted" ? "waitlisted" : "registered");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setRegistrationStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinWaitlist = async () => {
    if (!profileId) {
      setError("Debes iniciar sesión para unirte a la lista de espera");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profileId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Error al unirte a la lista de espera");
      }

      setRegistrationStatus("waitlisted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!event) {
    notFound();
  }

  const isRegistrationOpen =
    (!event.registrationStartDate || new Date(event.registrationStartDate) <= new Date()) &&
    (!event.registrationEndDate || new Date(event.registrationEndDate) >= new Date());

  const isFull =
    event.maxCapacity !== null &&
    event.stats?.availableSlots === 0;

  const location = [event.city, event.province, event.country].filter(Boolean).join(", ");

  const dateText = event.startDate
    ? event.endDate && event.endDate !== event.startDate
      ? `${event.startDate} - ${event.endDate}`
      : event.startDate
    : null;

  const levelLabels: Record<string, string> = {
    internal: "Interno",
    local: "Local",
    national: "Nacional",
    international: "Internacional",
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Eventos", href: `/app/${academyId}/events` },
          { label: event.title },
          { label: "Registro" },
        ]}
      />

      {/* Success States */}
      {registrationStatus === "registered" && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <AlertTitle className="text-green-800">Registro exitoso</AlertTitle>
          <AlertDescription className="text-green-700">
            Te has registrado correctamente en el evento. Te notificaremos cuando tu registro sea confirmado.
          </AlertDescription>
        </Alert>
      )}

      {registrationStatus === "waitlisted" && (
        <Alert className="border-amber-200 bg-amber-50">
          <Clock className="h-5 w-5 text-amber-600" />
          <AlertTitle className="text-amber-800">Inscripción en lista de espera</AlertTitle>
          <AlertDescription className="text-amber-700">
            El evento está completo, pero te has unido a la lista de espera. Te notificaremos si se libera un lugar.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Event Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">{event.title}</h1>
          {event.academyName && (
            <p className="text-muted-foreground mt-1">Organizado por {event.academyName}</p>
          )}
        </div>

        {/* Event Info Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {dateText && (
            <Card>
              <CardContent className="flex items-center gap-3 pt-4">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Fecha</p>
                  <p className="text-sm text-muted-foreground">
                    {formatLongDateForCountry(dateText, event.academyCountry)}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {location && (
            <Card>
              <CardContent className="flex items-center gap-3 pt-4">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Ubicación</p>
                  <p className="text-sm text-muted-foreground">{location}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex items-center gap-3 pt-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Nivel</p>
                <p className="text-sm text-muted-foreground">
                  {levelLabels[event.level] || event.level}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Event Description */}
      {event.description && (
        <Card>
          <CardHeader>
            <CardTitle>Descripción</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-muted-foreground">{event.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Registration Section */}
      <Card>
        <CardHeader>
          <CardTitle>Inscripción</CardTitle>
          <CardDescription>
            {!isRegistrationOpen && (
              <span className="text-amber-600">
                Las inscripciones {event.registrationStartDate && new Date(event.registrationStartDate) > new Date()
                  ? "abren el"
                  : "cerraron el"}{" "}
                {event.registrationStartDate
                  ? formatLongDateForCountry(event.registrationStartDate, event.academyCountry)
                  : event.registrationEndDate
                  ? formatLongDateForCountry(event.registrationEndDate, event.academyCountry)
                  : ""}
              </span>
            )}
            {isRegistrationOpen && event.maxCapacity && (
              <span>
                {event.stats?.availableSlots !== null && event.stats?.availableSlots !== undefined
                  ? `${event.stats.availableSlots} lugares disponibles`
                  : "Capacidad limitada"}
                {event.stats?.confirmedRegistrations !== undefined && (
                  <span className="text-muted-foreground ml-2">
                    ({event.stats.confirmedRegistrations} inscritos)
                  </span>
                )}
              </span>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {registrationStatus === "idle" && isRegistrationOpen && (
            <>
              {event.registrationFee !== null && event.registrationFee > 0 && (
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-sm font-medium">Cuota de inscripción</p>
                  <p className="text-2xl font-bold">
                    {(event.registrationFee / 100).toLocaleString("es-ES", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="notes">Notas (opcional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Añade alguna nota o comentario para tu inscripción..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                {isFull ? (
                  event.allowWaitlist ? (
                    <WaitlistPosition
                      eventId={eventId}
                      profileId={profileId || ""}
                      maxSize={event.waitlistMaxSize}
                      onRegister={async (profileId) => {
                        const response = await fetch(`/api/events/${eventId}/waitlist`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ profileId }),
                        });
                        if (!response.ok) {
                          const data = await response.json();
                          throw new Error(data.message || "Error");
                        }
                      }}
                    />
                  ) : (
                    <Alert>
                      <AlertCircle className="h-5 w-5" />
                      <AlertTitle>Evento completo</AlertTitle>
                      <AlertDescription>
                        Lo sentimos, ya no hay lugares disponibles en este evento.
                      </AlertDescription>
                    </Alert>
                  )
                ) : (
                  <Button
                    size="lg"
                    onClick={handleRegister}
                    disabled={submitting}
                    className="w-full"
                  >
                    {submitting ? "Registrando..." : "Registrarme"}
                  </Button>
                )}
              </div>
            </>
          )}

          {(!isRegistrationOpen || registrationStatus !== "idle") && (
            <div className="text-center py-4">
              {isRegistrationOpen ? (
                registrationStatus === "registered" || registrationStatus === "waitlisted" ? (
                  <p className="text-muted-foreground">
                    Ya estás {registrationStatus === "waitlisted" ? "en la lista de espera" : "registrado"} en este evento.
                  </p>
                ) : null
              ) : (
                <p className="text-muted-foreground">
                  Las inscripciones están cerradas para este evento.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
