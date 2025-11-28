"use client";

import { AlertTriangle, TrendingDown, CreditCard, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AlertBadgeProps {
  type: "capacity" | "payment" | "attendance";
  severity?: "high" | "medium" | "low";
  className?: string;
}

export function AlertBadge({ type, severity = "medium", className }: AlertBadgeProps) {
  const getIcon = () => {
    switch (type) {
      case "capacity":
        return Users;
      case "payment":
        return CreditCard;
      case "attendance":
        return TrendingDown;
      default:
        return AlertTriangle;
    }
  };

  const getVariant = () => {
    if (severity === "high") return "error";
    if (severity === "medium") return "default";
    return "outline";
  };

  const Icon = getIcon();

  return (
    <Badge variant={getVariant()} className={cn("gap-1 text-xs", className)}>
      <Icon className="h-3 w-3" />
      {type === "capacity" && "Cupo"}
      {type === "payment" && "Pago"}
      {type === "attendance" && "Asistencia"}
    </Badge>
  );
}

