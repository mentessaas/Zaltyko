"use client";

import { X, Users, Rocket } from "lucide-react";
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
    <div className="relative rounded-card border border-zaltyko-mist border-b-2 border-b-zaltyko-teal bg-white p-6 shadow-soft">
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-control text-zaltyko-text-light transition hover:bg-zaltyko-white hover:text-zaltyko-navy"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="pr-8">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-zaltyko-primary-ultralight">
            {isNewUser ? <Users className="h-5 w-5 text-zaltyko-teal" /> : <Rocket className="h-5 w-5 text-zaltyko-teal" />}
          </div>
          <h2 className="font-display text-2xl font-bold text-zaltyko-navy">
            {isNewUser ? `¡Bienvenido a Zaltyko, ${displayName}!` : `¡Hola de nuevo, ${displayName}!`}
          </h2>
        </div>
        <p className="text-base leading-relaxed text-zaltyko-text-secondary">
          {isNewUser ? (
            <>
              <strong className="text-zaltyko-teal">{academyName || "Tu academia"}</strong> ya está creada.
              Importa tus gimnastas y monta el primer grupo para empezar a ver el panel con datos reales.
            </>
          ) : (
            <>
              {academyName || "Tu academia"} tiene pasos de configuración pendientes en el checklist de abajo.
            </>
          )}
        </p>
        {isNewUser && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="sm">
              <Link href={`/app/${academyId}/athletes`}>
                Importar gimnastas
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

