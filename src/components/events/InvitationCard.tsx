"use client";

import { memo, useState } from "react";
import { Mail, MailOpen, Check, X, Clock, AlertCircle, MoreVertical } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface InvitationCardProps {
  invitation: {
    id: string;
    email: string;
    status: "pending" | "sent" | "accepted" | "declined" | "expired";
    athleteName?: string;
    guardianName?: string;
    invitedByName?: string;
    sentAt?: string | Date | null;
    respondedAt?: string | Date | null;
    response?: string | null;
    createdAt: string | Date;
  };
  eventTitle?: string;
  onUpdateStatus?: (id: string, status: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onResend?: (id: string) => Promise<void>;
}

const statusConfig = {
  pending: {
    label: "Pendiente",
    icon: Clock,
    variant: "outline" as const,
    className: "border-zaltyko-mist bg-zaltyko-mist/30 text-zaltyko-text-secondary",
  },
  sent: {
    label: "Enviada",
    icon: Mail,
    variant: "outline" as const,
    className: "border-zaltyko-indigo/20 bg-zaltyko-indigo/10 text-zaltyko-indigo",
  },
  accepted: {
    label: "Aceptada",
    icon: Check,
    variant: "active" as const,
    className: "border-zaltyko-teal/20 bg-zaltyko-teal/10 text-zaltyko-teal",
  },
  declined: {
    label: "Rechazada",
    icon: X,
    variant: "error" as const,
    className: "border-zaltyko-coral/20 bg-zaltyko-coral/10 text-zaltyko-coral",
  },
  expired: {
    label: "Expirada",
    icon: AlertCircle,
    variant: "outline" as const,
    className: "border-zaltyko-mist bg-zaltyko-warm-white text-zaltyko-text-secondary",
  },
};

export const InvitationCard = memo(function InvitationCard({
  invitation,
  onUpdateStatus,
  onDelete,
  onResend,
}: InvitationCardProps) {
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = statusConfig[invitation.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  const handleStatusUpdate = async (newStatus: string) => {
    if (!onUpdateStatus) return;

    setLoading(true);
    setError(null);

    try {
      await onUpdateStatus(invitation.id, newStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setLoading(true);
    setError(null);

    try {
      await onDelete(invitation.id);
      setDeleteDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!onResend) return;

    setLoading(true);
    setError(null);

    try {
      await onResend(invitation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reenviar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="transition hover:border-zaltyko-teal/40">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-zaltyko-teal" />
                {invitation.email}
              </CardTitle>
              {(invitation.athleteName || invitation.guardianName) && (
                <CardDescription>
                  {invitation.athleteName && `Atleta: ${invitation.athleteName}`}
                  {invitation.athleteName && invitation.guardianName && " / "}
                  {invitation.guardianName && `Guardián: ${invitation.guardianName}`}
                </CardDescription>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Badge className={config.className} variant={config.variant}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>

              {(onUpdateStatus || onDelete || onResend) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onResend && (invitation.status === "pending" || invitation.status === "sent") && (
                      <DropdownMenuItem onClick={handleResend} disabled={loading}>
                        <Mail className="h-4 w-4 mr-2" />
                        Reenviar invitación
                      </DropdownMenuItem>
                    )}

                    {onUpdateStatus && invitation.status === "sent" && (
                      <>
                        <DropdownMenuItem
                          onClick={() => handleStatusUpdate("accepted")}
                          disabled={loading}
                        >
                          <Check className="mr-2 h-4 w-4 text-zaltyko-teal" />
                          Marcar como aceptada
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleStatusUpdate("declined")}
                          disabled={loading}
                        >
                          <X className="mr-2 h-4 w-4 text-zaltyko-coral" />
                          Marcar como rechazada
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}

                    {onDelete && (
                      <DropdownMenuItem
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-zaltyko-coral focus:text-zaltyko-coral"
                        disabled={loading}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Eliminar invitación
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {error && (
            <div className="flex items-center gap-2 text-sm text-zaltyko-coral">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="space-y-1 text-xs text-zaltyko-text-secondary">
            {invitation.invitedByName && (
              <p>Invitada por: {invitation.invitedByName}</p>
            )}
            {invitation.sentAt && (
              <p>Enviada: {new Date(invitation.sentAt).toLocaleDateString("es-ES")}</p>
            )}
            {invitation.respondedAt && (
              <p>
                Respondida: {new Date(invitation.respondedAt).toLocaleDateString("es-ES")}
              </p>
            )}
            {invitation.response && (
              <p className="italic">&quot;{invitation.response}&quot;</p>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar invitación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la invitación enviada a {invitation.email}.
              No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

export function InvitationCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
    </Card>
  );
}

interface InvitationStatsProps {
  stats: {
    total: number;
    pending: number;
    sent: number;
    accepted: number;
    declined: number;
    expired: number;
  };
}

export function InvitationStats({ stats }: InvitationStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-4">
          <div className="font-display text-2xl font-bold text-zaltyko-navy">{stats.total}</div>
          <p className="text-xs text-zaltyko-text-secondary">Total</p>
        </CardContent>
      </Card>

      <Card className="border-zaltyko-indigo/20 bg-zaltyko-indigo/10">
        <CardContent className="pt-4">
          <div className="font-display text-2xl font-bold text-zaltyko-indigo">{stats.sent}</div>
          <p className="text-xs text-zaltyko-indigo">Enviadas</p>
        </CardContent>
      </Card>

      <Card className="border-zaltyko-teal/20 bg-zaltyko-teal/10">
        <CardContent className="pt-4">
          <div className="font-display text-2xl font-bold text-zaltyko-teal">{stats.accepted}</div>
          <p className="text-xs text-zaltyko-teal">Aceptadas</p>
        </CardContent>
      </Card>

      <Card className="border-zaltyko-coral/20 bg-zaltyko-coral/10">
        <CardContent className="pt-4">
          <div className="font-display text-2xl font-bold text-zaltyko-coral">{stats.declined}</div>
          <p className="text-xs text-zaltyko-coral">Rechazadas</p>
        </CardContent>
      </Card>
    </div>
  );
}
