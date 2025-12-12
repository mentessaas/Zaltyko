"use client";

import { X } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

interface WelcomeBannerProps {
  academyName: string | null;
  userName: string | null;
  academyId: string;
  isNewUser?: boolean;
}

export function WelcomeBanner({ academyName, userName, academyId, isNewUser = false }: WelcomeBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  const displayName = userName || "equipo";

  return (
    <div className="relative rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 shadow-sm">
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition hover:bg-background/50"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="pr-8">
        <h2 className="text-xl font-semibold text-foreground">
          {isNewUser ? `¡Bienvenido a Zaltyko, ${displayName}! 🎉` : `¡Hola de nuevo, ${displayName}! 👋`}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isNewUser ? (
            <>
              Estás a punto de transformar la gestión de <strong>{academyName || "tu academia"}</strong>. 
              En los próximos minutos configurarás lo esencial y empezarás a ver resultados.
            </>
          ) : (
            <>
              {academyName || "Tu academia"} está lista para crecer. Completa tu configuración 
              para desbloquear todas las funciones.
            </>
          )}
        </p>
        {isNewUser && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/app/${academyId}/groups`}>
                Empezar configuración
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/app/${academyId}/dashboard`}>
                Explorar dashboard
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

