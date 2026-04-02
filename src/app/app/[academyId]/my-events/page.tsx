"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, MapPin, Clock, CheckCircle, XCircle, AlertCircle, Trophy } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";

interface MyEventRegistration {
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartDate: string | null;
  eventEndDate: string | null;
  eventLocation: string | null;
  eventStatus: string;
  registrationStatus: "pending" | "confirmed" | "cancelled" | "waitlisted";
  registeredAt: string;
  academyId: string;
  academyName: string;
}

interface MyEventsPageProps {
  params: {
    academyId: string;
  };
}

export default function MyEventsPage({ params }: MyEventsPageProps) {
  const router = useRouter();
  const { academyId } = params;

  const [registrations, setRegistrations] = useState<MyEventRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "upcoming" | "past">("upcoming");

  const fetchMyEvents = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/my-registrations`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Error al cargar tus eventos");
      }

      const data = await response.json();
      setRegistrations(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyEvents();
  }, [fetchMyEvents]);

  const now = new Date();

  const filteredRegistrations = registrations.filter((reg) => {
    const eventDate = reg.eventStartDate ? new Date(reg.eventStartDate) : null;
    const isUpcoming = eventDate && eventDate >= now;
    const isPast = eventDate && eventDate < now;

    if (activeTab === "upcoming") return isUpcoming;
    if (activeTab === "past") return isPast;
    return true;
  });

  const statusConfig = {
    pending: {
      label: "Pendiente",
      icon: Clock,
      variant: "outline" as const,
      className: "bg-yellow-100 text-yellow-700",
    },
    confirmed: {
      label: "Confirmado",
      icon: CheckCircle,
      variant: "default" as const,
      className: "bg-green-100 text-green-700",
    },
    cancelled: {
      label: "Cancelado",
      icon: XCircle,
      variant: "error" as const,
      className: "bg-red-100 text-red-700",
    },
    waitlisted: {
      label: "En espera",
      icon: AlertCircle,
      variant: "outline" as const,
      className: "bg-orange-100 text-orange-700",
    },
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Fecha por confirmar";
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Mis Eventos" },
        ]}
      />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Mis Eventos</h1>
        <p className="text-muted-foreground mt-1">
          Los eventos en los que te has inscrito
        </p>
      </div>

      {/* Stats */}
      {!loading && registrations.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{registrations.length}</div>
              <p className="text-xs text-muted-foreground">Total inscrito</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">
                {registrations.filter((r) => r.registrationStatus === "confirmed").length}
              </div>
              <p className="text-xs text-green-600">Confirmados</p>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-600">
                {registrations.filter((r) => r.registrationStatus === "pending").length}
              </div>
              <p className="text-xs text-yellow-600">Pendientes</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-orange-600">
                {registrations.filter((r) => r.registrationStatus === "waitlisted").length}
              </div>
              <p className="text-xs text-orange-600">En espera</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="upcoming">Próximos</TabsTrigger>
          <TabsTrigger value="past">Pasados</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredRegistrations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center mb-4">
                  {activeTab === "upcoming"
                    ? "No tienes eventos próximos"
                    : activeTab === "past"
                    ? "No tienes eventos pasados"
                    : "No te has inscrito en ningún evento todavía"}
                </p>
                <Button asChild>
                  <Link href={`/app/${academyId}/events`}>
                    Ver eventos disponibles
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredRegistrations.map((registration) => {
                const config = statusConfig[registration.registrationStatus] || statusConfig.pending;
                const StatusIcon = config.icon;
                const eventDateText = registration.eventEndDate &&
                  registration.eventEndDate !== registration.eventStartDate
                  ? `${formatDate(registration.eventStartDate)} - ${formatDate(registration.eventEndDate)}`
                  : formatDate(registration.eventStartDate);

                return (
                  <Card key={registration.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg leading-tight">
                          {registration.eventTitle}
                        </CardTitle>
                        <Badge className={config.className} variant={config.variant}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {eventDateText}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      {registration.eventLocation && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          {registration.eventLocation}
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground">
                        <p>Inscrito el {formatDate(registration.registeredAt)}</p>
                        <p className="mt-1">{registration.academyName}</p>
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" asChild>
                          <Link href={`/app/${academyId}/events/${registration.eventId}`}>
                            Ver detalles
                          </Link>
                        </Button>

                        {registration.registrationStatus === "confirmed" && (
                          <Button variant="outline" size="sm">
                            Ver pase
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
