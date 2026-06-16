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
      <div className="bg-zaltyko-primary text-white rounded-2xl shadow-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <RefreshCw className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold">Nueva versión disponible</p>
            <p className="text-sm text-white/80 mt-0.5">
              Actualiza para obtener las últimas funciones
            </p>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-white/60 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="flex-1 text-white hover:bg-white/20"
          >
            Después
          </Button>
          <Button
            size="sm"
            onClick={handleUpdate}
            disabled={isActivating}
            className="flex-1 bg-white text-zaltyko-primary hover:bg-white/90"
          >
            {isActivating ? "Actualizando..." : "Actualizar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
