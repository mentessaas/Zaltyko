"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { Plus, Mail, Search } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvitationCard, InvitationCardSkeleton, InvitationStats } from "@/components/events/InvitationCard";

interface Invitation {
  id: string;
  tenantId: string;
  eventId: string;
  athleteId: string | null;
  guardianId: string | null;
  email: string;
  status: "pending" | "sent" | "accepted" | "declined" | "expired";
  invitedBy: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  response: string | null;
  createdAt: string;
  athleteName?: string;
  guardianName?: string;
  invitedByName?: string;
}

interface InvitationsPageProps {
  params: {
    academyId: string;
    eventId: string;
  };
}

export default function EventInvitationsPage({ params }: InvitationsPageProps) {
  const router = useRouter();
  const { academyId, eventId } = params;

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    total: number;
    pending: number;
    sent: number;
    accepted: number;
    declined: number;
    expired: number;
  } | null>(null);

  // New invitation form
  const [newInvitationEmail, setNewInvitationEmail] = useState("");
  const [newInvitationAthleteId, setNewInvitationAthleteId] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchInvitations = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/invitations`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 404) {
          notFound();
        }
        throw new Error("Error al cargar las invitaciones");
      }

      const data = await response.json();
      setInvitations(data.items || []);
      setStats(data.stats || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const handleCreateInvitation = async () => {
    if (!newInvitationEmail) return;

    setCreating(true);
    setError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: newInvitationEmail,
          athleteId: newInvitationAthleteId || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Error al crear la invitación");
      }

      setNewInvitationEmail("");
      setNewInvitationAthleteId("");
      setDialogOpen(false);
      fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (invitationId: string, status: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/invitations/${invitationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Error al actualizar");
      }

      fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const handleDeleteInvitation = async (invitationId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/invitations/${invitationId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Error al eliminar");
      }

      fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/invitations/${invitationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "sent" }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Error al reenviar");
      }

      fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  };

  // Filter invitations
  const filteredInvitations = invitations.filter((inv) => {
    const matchesSearch =
      !searchQuery ||
      inv.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.athleteName && inv.athleteName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inv.guardianName && inv.guardianName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Eventos", href: `/app/${academyId}/events` },
          { label: "Invitaciones" },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invitaciones</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona las invitaciones para este evento
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nueva invitación
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear invitación</DialogTitle>
              <DialogDescription>
                Envía una invitación por correo electrónico para este evento.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={newInvitationEmail}
                  onChange={(e) => setNewInvitationEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="athleteId">Atleta (opcional)</Label>
                <Input
                  id="athleteId"
                  placeholder="ID del atleta"
                  value={newInvitationAthleteId}
                  onChange={(e) => setNewInvitationAthleteId(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreateInvitation}
                disabled={creating || !newInvitationEmail}
              >
                {creating ? "Creando..." : "Crear invitación"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      {stats && <InvitationStats stats={stats} />}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por email, atleta o guardián..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Badge
                variant={statusFilter === "all" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setStatusFilter("all")}
              >
                Todas ({invitations.length})
              </Badge>
              <Badge
                variant={statusFilter === "pending" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setStatusFilter("pending")}
              >
                Pendientes ({stats?.pending || 0})
              </Badge>
              <Badge
                variant={statusFilter === "sent" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setStatusFilter("sent")}
              >
                Enviadas ({stats?.sent || 0})
              </Badge>
              <Badge
                variant={statusFilter === "accepted" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setStatusFilter("accepted")}
              >
                Aceptadas ({stats?.accepted || 0})
              </Badge>
              <Badge
                variant={statusFilter === "declined" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setStatusFilter("declined")}
              >
                Rechazadas ({stats?.declined || 0})
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invitations List */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <InvitationCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredInvitations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || statusFilter !== "all"
                ? "No se encontraron invitaciones con esos filtros"
                : "No hay invitaciones creadas para este evento"}
            </p>
            {!searchQuery && statusFilter === "all" && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Crear primera invitación
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredInvitations.map((invitation) => (
            <InvitationCard
              key={invitation.id}
              invitation={invitation}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDeleteInvitation}
              onResend={handleResendInvitation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
