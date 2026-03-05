"use client";

import { X, Sparkles, Rocket } from "lucide-react";
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
    <div className="relative overflow-hidden rounded-2xl border border-zaltyko-primary/20 bg-gradient-to-br from-zaltyko-primary/10 via-white to-zaltyko-primary/5 p-6 shadow-lg shadow-zaltyko-primary/10">
      {/* Background Effects */}
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-zaltyko-primary/10 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-zaltyko-accent-teal/10 blur-2xl" />

      <button
        onClick={() => setDismissed(true)}
        className="absolute right-4 top-4 rounded-xl p-2 text-muted-foreground transition hover:bg-white/50 hover:text-foreground"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative pr-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center shadow-lg shadow-zaltyko-primary/30">
            {isNewUser ? <Sparkles className="h-5 w-5 text-white" /> : <Rocket className="h-5 w-5 text-white" />}
          </div>
          <h2 className="text-2xl font-display font-bold text-zaltyko-text-main">
            {isNewUser ? `¡Bienvenido a Zaltyko, ${displayName}!` : `¡Hola de nuevo, ${displayName}!`}
          </h2>
        </div>
        <p className="text-base text-zaltyko-text-secondary leading-relaxed">
          {isNewUser ? (
            <>
              Estás a punto de transformar la gestión de <strong className="text-zaltyko-primary">{academyName || "tu academia"}</strong>.
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
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              asChild
              size="sm"
              className="bg-gradient-to-r from-zaltyko-primary to-zaltyko-primary-dark hover:from-zaltyko-primary-dark hover:to-zaltyko-primary shadow-lg shadow-zaltyko-primary/25"
            >
              <Link href={`/app/${academyId}/groups`}>
                <Sparkles className="mr-2 h-4 w-4" />
                Empezar configuración
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="border-zaltyko-primary/30 hover:bg-zaltyko-primary/5">
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

