"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { UserPlus, Users, Clock, DollarSign, AlertCircle, CheckCircle2, XCircle, List } from "lucide-react";

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Inscripciones</CardTitle>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-muted rounded-lg">
            <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{confirmedCount}</p>
            <p className="text-xs text-muted-foreground">Confirmados</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pendientes</p>
          </div>
          {event.maxCapacity && (
            <div className="text-center p-3 bg-muted rounded-lg col-span-2">
              <EventCapacityBadge
                current={confirmedCount}
                max={event.maxCapacity}
                allowWaitlist={event.allowWaitlist}
              />
            </div>
          )}
        </div>

        {/* Countdown de inscripción */}
        <div className="mb-6 p-4 bg-primary/5 rounded-lg">
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
              <p className="text-center text-muted-foreground py-4">Cargando...</p>
            ) : registrations.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">No hay inscripciones aún</p>
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
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium">
                          {registration.athleteName.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{registration.athleteName}</p>
                        <p className="text-xs text-muted-foreground">
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
              <p className="text-center text-muted-foreground py-4">Cargando...</p>
            ) : waitlist.length === 0 ? (
              <div className="text-center py-8">
                <List className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">No hay nadie en lista de espera</p>
              </div>
            ) : (
              <div className="space-y-2">
                {waitlist.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center">
                        <span className="text-sm font-bold text-yellow-700 dark:text-yellow-300">
                          #{entry.position}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{entry.athleteName}</p>
                        <p className="text-xs text-muted-foreground">
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
