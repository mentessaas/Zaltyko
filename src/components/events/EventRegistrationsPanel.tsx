"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { UserPlus, Users, Clock, List } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RegistrationStatusBadge, EventCapacityBadge } from "./EventStatusBadge";
import { RegistrationCountdown } from "./EventCountdown";
import { Registration } from "@/types";

interface Event {
  id: string;
  title: string;
  startDate: string | Date | null;
  endDate?: string | Date | null;
  registrationStartDate?: string | Date | null;
  registrationEndDate?: string | Date | null;
  status: string;
  maxCapacity?: number | null;
  registrationFee?: number | null;
  allowWaitlist: boolean;
  waitlistMaxSize?: number | null;
}

interface EventRegistrationsPanelProps {
  event: Event;
}

export function EventRegistrationsPanel({ event }: EventRegistrationsPanelProps) {
  const router = useRouter();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("registrations");

  const fetchRegistrations = async () => {
    try {
      const response = await fetch(`/api/events/${event.id}/registrations`);
      if (response.ok) {
        const data = await response.json();
        setRegistrations(data.items || []);
      }
    } catch (error) {
      console.error("Error fetching registrations:", error);
    }
  };

  const fetchWaitlist = async () => {
    try {
      const response = await fetch(`/api/events/${event.id}/waitlist`);
      if (response.ok) {
        const data = await response.json();
        setWaitlist(data.items || []);
      }
    } catch (error) {
      console.error("Error fetching waitlist:", error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchRegistrations(), fetchWaitlist()]);
      setLoading(false);
    };

    fetchData();
  }, [event.id]);

  const confirmedCount = registrations.filter((r) => r.status === "confirmed").length;
  const pendingCount = registrations.filter((r) => r.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-display text-xl text-zaltyko-navy">Inscripciones</CardTitle>
            <CardDescription>Gestiona las inscripciones al evento</CardDescription>
          </div>
          <Button size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Nueva inscripción
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Resumen */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-3 text-center">
            <Users className="mx-auto mb-1 h-5 w-5 text-zaltyko-teal" />
            <p className="font-display text-2xl font-bold text-zaltyko-navy">{confirmedCount}</p>
            <p className="text-xs text-zaltyko-text-secondary">Confirmados</p>
          </div>
          <div className="rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-3 text-center">
            <Clock className="mx-auto mb-1 h-5 w-5 text-zaltyko-indigo" />
            <p className="font-display text-2xl font-bold text-zaltyko-navy">{pendingCount}</p>
            <p className="text-xs text-zaltyko-text-secondary">Pendientes</p>
          </div>
          {event.maxCapacity && (
            <div className="col-span-2 rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-3 text-center">
              <EventCapacityBadge
                current={confirmedCount}
                max={event.maxCapacity}
                allowWaitlist={event.allowWaitlist}
              />
            </div>
          )}
        </div>

        {/* Countdown de inscripción */}
        <div className="mb-6 rounded-xl border border-zaltyko-teal/20 bg-zaltyko-teal/10 p-4">
          <RegistrationCountdown
            startDate={event.registrationStartDate}
            endDate={event.registrationEndDate}
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="registrations" className="flex-1">
              Inscripciones ({registrations.length})
            </TabsTrigger>
            <TabsTrigger value="waitlist" className="flex-1">
              Lista de espera ({waitlist.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="registrations" className="mt-4">
            {loading ? (
              <p className="py-4 text-center text-zaltyko-text-secondary">Cargando...</p>
            ) : registrations.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="mx-auto mb-3 h-12 w-12 text-zaltyko-mist" />
                <p className="text-zaltyko-text-secondary">Aún no hay inscripciones. Empieza añadiendo una.</p>
                <Button variant="outline" size="sm" className="mt-4">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Inscribir atleta
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {registrations.map((registration) => (
                  <div
                    key={registration.id}
                    className="flex items-center justify-between rounded-xl border border-zaltyko-mist bg-white p-3 transition-colors hover:border-zaltyko-teal/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zaltyko-teal/10">
                        <span className="text-sm font-medium text-zaltyko-teal">
                          {registration.athleteName.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zaltyko-navy">{registration.athleteName}</p>
                        <p className="text-xs text-zaltyko-text-secondary">
                          {registration.categoryName || "Sin categoría"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RegistrationStatusBadge status={registration.status} />
                      <Button variant="ghost" size="sm">
                        Ver
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="waitlist" className="mt-4">
            {loading ? (
              <p className="py-4 text-center text-zaltyko-text-secondary">Cargando...</p>
            ) : waitlist.length === 0 ? (
              <div className="py-8 text-center">
                <List className="mx-auto mb-3 h-12 w-12 text-zaltyko-mist" />
                <p className="text-zaltyko-text-secondary">No hay nadie en lista de espera</p>
              </div>
            ) : (
              <div className="space-y-2">
                {waitlist.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-xl border border-zaltyko-mist bg-white p-3 transition-colors hover:border-zaltyko-teal/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zaltyko-indigo/10">
                        <span className="text-sm font-bold text-zaltyko-indigo">
                          #{entry.position}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zaltyko-navy">{entry.athleteName}</p>
                        <p className="text-xs text-zaltyko-text-secondary">
                          {entry.categoryName || "Sin categoría"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{entry.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
