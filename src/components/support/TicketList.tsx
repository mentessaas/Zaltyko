"use client";

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  createdBy?: {
    id: string;
    fullName: string;
    email: string;
  };
  assignedTo?: {
    id: string;
    fullName: string;
  };
  academy?: {
    id: string;
    name: string;
  };
  _count?: {
    responses: number;
  };
}

interface TicketListProps {
  tickets: Ticket[];
  isAdmin?: boolean;
  emptyMessage?: string;
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
  feature_request: { label: "Solicitud" },
  other: { label: "Otro" },
};

export function TicketList({ tickets, isAdmin = false, emptyMessage = "No hay tickets" }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">{emptyMessage}</p>
          {!isAdmin && (
            <Link href="support/new">
              <Button className="mt-4">Crear primer ticket</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => {
        const status = statusConfig[ticket.status];
        const priority = priorityConfig[ticket.priority];
        const category = categoryConfig[ticket.category];

        return (
          <Card key={ticket.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Link href={isAdmin ? `/super-admin/support/${ticket.id}` : `/support/${ticket.id}`}>
                    <CardTitle className="text-base hover:text-primary transition-colors truncate">
                      {ticket.title}
                    </CardTitle>
                  </Link>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {ticket.description}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Badge variant={priority.variant}>{priority.label}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <Badge variant={status.variant}>{status.label}</Badge>
                <span>{category.label}</span>
                <span>
                  Creado: {format(new Date(ticket.createdAt), "d MMM yyyy", { locale: es })}
                </span>
                {ticket._count && (
                  <span>{ticket._count.responses} respuesta(s)</span>
                )}
                {isAdmin && ticket.createdBy && (
                  <span>Por: {ticket.createdBy.fullName}</span>
                )}
                {isAdmin && ticket.assignedTo && (
                  <span>Asignado: {ticket.assignedTo.fullName}</span>
                )}
                {isAdmin && ticket.academy && (
                  <span>Academia: {ticket.academy.name}</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
