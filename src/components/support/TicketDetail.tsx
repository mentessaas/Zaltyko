"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TicketResponseForm } from "./TicketResponse";
import { TicketStatus, TicketPriority, TicketCategory } from "./TicketFilters";

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  createdAt: string | Date;
  updatedAt: string | Date;
  resolvedAt?: string | Date;
  closedAt?: string | Date;
  createdBy: {
    id: string;
    fullName: string;
    email: string;
  };
  assignedTo?: {
    id: string;
    fullName: string;
    email: string;
  };
  academy?: {
    id: string;
    name: string;
  };
  responses: TicketResponse[];
}

interface TicketResponse {
  id: string;
  message: string;
  isInternal: boolean;
  createdAt: string | Date;
  user: {
    id: string;
    fullName: string;
  };
  attachments?: TicketAttachment[];
}

interface TicketAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string;
}

interface TicketDetailProps {
  ticket: Ticket;
  currentUserId: string;
  isAdmin?: boolean;
  onStatusChange?: (newStatus: TicketStatus) => Promise<void>;
  onAssign?: (userId: string) => Promise<void>;
}

const statusConfig: Record<TicketStatus, { label: string; variant: "default" | "outline" | "success" | "pending" | "error" }> = {
  open: { label: "Abierto", variant: "default" },
  in_progress: { label: "En Progreso", variant: "pending" },
  waiting: { label: "Esperando", variant: "outline" },
  resolved: { label: "Resuelto", variant: "success" },
  closed: { label: "Cerrado", variant: "outline" },
};

const priorityConfig: Record<TicketPriority, { label: string; variant: "default" | "outline" | "error" | "pending" }> = {
  low: { label: "Baja", variant: "outline" },
  medium: { label: "Media", variant: "pending" },
  high: { label: "Alta", variant: "default" },
  urgent: { label: "Urgente", variant: "error" },
};

const categoryConfig: Record<TicketCategory, { label: string }> = {
  technical: { label: "Técnico" },
  billing: { label: "Facturación" },
  account: { label: "Cuenta" },
  feature_request: { label: "Solicitud de Función" },
  other: { label: "Otro" },
};

export function TicketDetail({ ticket, currentUserId, isAdmin = false, onStatusChange, onAssign }: TicketDetailProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const status = statusConfig[ticket.status];
  const priority = priorityConfig[ticket.priority];
  const category = categoryConfig[ticket.category];

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!onStatusChange) return;
    setIsUpdating(true);
    try {
      await onStatusChange(newStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  const canRespond = ticket.status !== "closed" && ticket.status !== "resolved";
  const isOwner = ticket.createdBy.id === currentUserId;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={isAdmin ? "/super-admin/support" : "/support"}>
            <Button variant="ghost" size="sm" className="mb-2">
              ← Volver
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">{ticket.title}</h1>
        </div>
        <div className="flex gap-2">
          <Badge variant={priority.variant}>{priority.label}</Badge>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-normal">Información del ticket</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Categoría:</span>
            <p className="font-medium">{category.label}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Creado por:</span>
            <p className="font-medium">{ticket.createdBy.fullName}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Fecha:</span>
            <p className="font-medium">{format(new Date(ticket.createdAt), "d MMM yyyy", { locale: es })}</p>
          </div>
          {ticket.assignedTo && (
            <div>
              <span className="text-muted-foreground">Asignado a:</span>
              <p className="font-medium">{ticket.assignedTo.fullName}</p>
            </div>
          )}
          {ticket.academy && (
            <div>
              <span className="text-muted-foreground">Academia:</span>
              <p className="font-medium">{ticket.academy.name}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Descripción</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">{ticket.description}</p>
        </CardContent>
      </Card>

      {ticket.responses.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Respuestas ({ticket.responses.length})</h2>
          {ticket.responses.map((response) => (
            <Card key={response.id} className={response.isInternal ? "border-yellow-300 bg-yellow-50" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{response.user.fullName}</span>
                    {response.isInternal && (
                      <Badge variant="outline" className="text-yellow-600">Interno</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(response.createdAt), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{response.message}</p>
                {response.attachments && response.attachments.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-2">Adjuntos:</p>
                    <div className="flex flex-wrap gap-2">
                      {response.attachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={attachment.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {attachment.fileName}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canRespond && (
        <TicketResponseForm
          ticketId={ticket.id}
          isAdmin={isAdmin}
        />
      )}

      {isAdmin && onStatusChange && ticket.status !== "closed" && (
        <Card>
          <CardHeader>
            <CardTitle>Acciones de administrador</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {ticket.status === "open" && (
              <Button
                variant="outline"
                onClick={() => handleStatusChange("in_progress")}
                disabled={isUpdating}
              >
                Marcar En Progreso
              </Button>
            )}
            {(ticket.status === "open" || ticket.status === "in_progress") && (
              <Button
                variant="outline"
                onClick={() => handleStatusChange("waiting")}
                disabled={isUpdating}
              >
                Esperar Respuesta
              </Button>
            )}
            {(ticket.status as string) !== "resolved" && (ticket.status as string) !== "closed" && (
              <>
                <Button
                  variant="default"
                  onClick={() => handleStatusChange("resolved")}
                  disabled={isUpdating}
                >
                  Resolver
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleStatusChange("closed")}
                  disabled={isUpdating}
                >
                  Cerrar Ticket
                </Button>
              </>
            )}
            {(ticket.status === "resolved" || ticket.status === "waiting") && (
              <Button
                variant="outline"
                onClick={() => handleStatusChange("open")}
                disabled={isUpdating}
              >
                Reabrir
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
