"use client";

import { useServiceWorker } from "@/hooks/useServiceWorker";
import { RefreshCw, X } from "lucide-react";
import { Button } from "./button";
import { useState } from "react";

export function UpdateBanner() {
  const { waitingWorker, update, activate, isUpdateAvailable } =
    useServiceWorker();
  const [dismissed, setDismissed] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  if (!isUpdateAvailable || dismissed || !waitingWorker) {
    return null;
  }

  const handleUpdate = async () => {
    setIsActivating(true);
    await activate();
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      {/* Banda de zona de seguridad: aviso de producto sobre tapiz, con CTA de cinta. */}
      <div className="rounded-xl bg-mat-deep p-4 text-white shadow-medium">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-white/15">
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-black uppercase leading-none">Nueva versión disponible</p>
            <p className="mt-1 text-sm text-white/85">
              Actualiza para obtener las últimas funciones
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="flex-1 text-white hover:bg-white/10 hover:text-white"
          >
            Después
          </Button>
          <Button
            size="sm"
            onClick={handleUpdate}
            disabled={isActivating}
            className="flex-1 bg-white font-extrabold text-mat-deep shadow-none hover:bg-chalk"
          >
            {isActivating ? "Actualizando..." : "Actualizar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
