"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type EventStatus = "draft" | "published" | "cancelled" | "completed";

interface EventStatusBadgeProps {
  status: EventStatus;
  className?: string;
}

const statusConfig: Record<EventStatus, { label: string; variant: "default" | "outline" | "active" | "pending" | "success" | "error" | null | undefined }> = {
  draft: { label: "Borrador", variant: "outline" },
  published: { label: "Publicado", variant: "success" },
  cancelled: { label: "Cancelado", variant: "error" },
  completed: { label: "Completado", variant: "outline" },
};

export function EventStatusBadge({ status, className }: EventStatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: "outline" };

  return (
    <Badge variant={config.variant} className={cn("capitalize", className)}>
      {config.label}
    </Badge>
  );
}

interface RegistrationStatusBadgeProps {
  status: "pending" | "confirmed" | "cancelled" | "waitlisted";
  className?: string;
}

const registrationStatusConfig: Record<string, { label: string; variant: "default" | "outline" | "active" | "pending" | "success" | "error" | null | undefined }> = {
  pending: { label: "Pendiente", variant: "pending" },
  confirmed: { label: "Confirmado", variant: "success" },
  cancelled: { label: "Cancelado", variant: "error" },
  waitlisted: { label: "En espera", variant: "outline" },
};

export function RegistrationStatusBadge({ status, className }: RegistrationStatusBadgeProps) {
  const config = registrationStatusConfig[status] ?? { label: status, variant: "outline" };

  return (
    <Badge variant={config.variant} className={cn("capitalize", className)}>
      {config.label}
    </Badge>
  );
}

interface EventCapacityBadgeProps {
  current: number;
  max: number;
  allowWaitlist: boolean;
  className?: string;
}

export function EventCapacityBadge({ current, max, allowWaitlist, className }: EventCapacityBadgeProps) {
  const percentage = max > 0 ? (current / max) * 100 : 0;
  const isFull = current >= max;

  let variant: "default" | "outline" | "active" | "pending" | "success" | "error" | null | undefined = "success";
  let label = `${current}/${max}`;

  if (isFull) {
    variant = allowWaitlist ? "pending" : "error";
    label = allowWaitlist ? "Lleno (waitlist)" : "Lleno";
  } else if (percentage >= 80) {
    variant = "pending";
    label = `${current}/${max} (casi lleno)`;
  } else if (percentage >= 50) {
    variant = "default";
    label = `${current}/${max}`;
  } else {
    variant = "success";
    label = `${current}/${max}`;
  }

  return (
    <Badge variant={variant} className={cn("capitalize", className)}>
      {label}
    </Badge>
  );
}
