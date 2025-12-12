"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Users, MapPin, Building2, Globe } from "lucide-react";

interface EventNotificationsProps {
  eventId: string;
  academyId: string;
}

export function EventNotifications({ eventId, academyId }: EventNotificationsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: string; sent: number; errors: number } | null>(null);

  const handleNotify = async (type: "internal_staff" | "city" | "province" | "country") => {
    setLoading(type);
    setResult(null);

    try {
      const response = await fetch(`/api/events/${eventId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Incluir cookies para autenticación
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data);
      } else {
        const data = await response.json();
        alert(data.message || "Error al enviar notificaciones");
      }
    } catch (error) {
      console.error("Error sending notifications:", error);
      alert("Error al enviar notificaciones");
    } finally {
      setLoading(null);
    }
  };

  const buttons = [
    {
      type: "internal_staff" as const,
      label: "Personal interno",
      icon: Users,
      description: "Notificar a todo el personal de la academia",
    },
    {
      type: "city" as const,
      label: "Academias de la ciudad",
      icon: MapPin,
      description: "Notificar a academias de la misma ciudad",
    },
    {
      type: "province" as const,
      label: "Academias de la provincia",
      icon: Building2,
      description: "Notificar a academias de la misma provincia",
    },
    {
      type: "country" as const,
      label: "Academias del país",
      icon: Globe,
      description: "Notificar a academias del mismo país",
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Enviar notificaciones</h3>
      <p className="text-sm text-muted-foreground">
        Notifica sobre este evento a diferentes grupos de academias y personal.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {buttons.map((btn) => {
          const Icon = btn.icon;
          const isLoading = loading === btn.type;

          return (
            <div
              key={btn.type}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted">
                  <Icon className="h-5 w-5 text-zaltyko-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground">{btn.label}</h4>
                  <p className="text-xs text-muted-foreground">{btn.description}</p>
                </div>
              </div>
              <Button
                onClick={() => handleNotify(btn.type)}
                disabled={isLoading}
                variant="outline"
                className="w-full"
              >
                {isLoading ? "Enviando..." : "Enviar notificación"}
              </Button>
              {result && result.type === btn.type && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {result.sent} notificaciones enviadas
                  {result.errors > 0 && `, ${result.errors} errores`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

