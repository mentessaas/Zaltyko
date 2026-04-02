"use client";

import { useState } from "react";
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
    className: "bg-gray-100 text-gray-700",
  },
  sent: {
    label: "Enviada",
    icon: Mail,
    variant: "default" as const,
    className: "bg-blue-100 text-blue-700",
  },
  accepted: {
    label: "Aceptada",
    icon: Check,
    variant: "default" as const,
    className: "bg-green-100 text-green-700",
  },
  declined: {
    label: "Rechazada",
    icon: X,
    variant: "error" as const,
    className: "bg-red-100 text-red-700",
  },
  expired: {
    label: "Expirada",
    icon: AlertCircle,
    variant: "outline" as const,
    className: "bg-orange-100 text-orange-700",
  },
};

export function InvitationCard({
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
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
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
                          <Check className="h-4 w-4 mr-2 text-green-600" />
                          Marcar como aceptada
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleStatusUpdate("declined")}
                          disabled={loading}
                        >
                          <X className="h-4 w-4 mr-2 text-red-600" />
                          Marcar como rechazada
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}

                    {onDelete && (
                      <DropdownMenuItem
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive focus:text-destructive"
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
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
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
              <p className="italic">"{invitation.response}"</p>
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
}

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
          <div className="text-2xl font-bold">{stats.total}</div>
          <p className="text-xs text-muted-foreground">Total</p>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-blue-600">{stats.sent}</div>
          <p className="text-xs text-blue-600">Enviadas</p>
        </CardContent>
      </Card>

      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-green-600">{stats.accepted}</div>
          <p className="text-xs text-green-600">Aceptadas</p>
        </CardContent>
      </Card>

      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-red-600">{stats.declined}</div>
          <p className="text-xs text-red-600">Rechazadas</p>
        </CardContent>
      </Card>
    </div>
  );
}
