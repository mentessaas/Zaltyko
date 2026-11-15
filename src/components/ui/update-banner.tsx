"use client";

import { useServiceWorker } from "@/hooks/useServiceWorker";
import { RefreshCw, X } from "lucide-react";
import { Button } from "./button";
import { useEffect, useRef, useState } from "react";

export const UPDATE_BANNER_DISMISSED_KEY = "zaltyko:update-banner-dismissed";

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(UPDATE_BANNER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    window.sessionStorage.setItem(UPDATE_BANNER_DISMISSED_KEY, "1");
  } catch {
    // Sin almacenamiento: el aviso solo se oculta mientras la página siga abierta.
  }
}

export function UpdateBanner() {
  const { waitingWorker, update, activate, isUpdateAvailable } =
    useServiceWorker();
  // Si ya pulsó «Después» en esta sesión, no volvemos a molestar al navegar.
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && readDismissed(),
  );
  const [isActivating, setIsActivating] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  const visible = isUpdateAvailable && !dismissed && Boolean(waitingWorker);

  // Mientras el aviso se ve, la página reserva su altura para que no tape
  // botones ni formularios (ver `body[data-update-banner]` en globals.css).
  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    const syncHeight = () => {
      const height = bannerRef.current?.offsetHeight ?? 0;
      root.style.setProperty("--update-banner-height", `${height}px`);
    };
    syncHeight();
    document.body.setAttribute("data-update-banner", "visible");
    window.addEventListener("resize", syncHeight);
    return () => {
      window.removeEventListener("resize", syncHeight);
      document.body.removeAttribute("data-update-banner");
      root.style.removeProperty("--update-banner-height");
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  const dismiss = () => {
    rememberDismissed();
    setDismissed(true);
  };

  const handleUpdate = async () => {
    setIsActivating(true);
    await activate();
  };

  return (
    <div
      ref={bannerRef}
      role="status"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      {/* Banda de zona de seguridad: aviso de producto sobre tapiz, con CTA de cinta. */}
      <div className="rounded-xl bg-mat-deep p-4 text-white shadow-medium">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-white/15">
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-black uppercase leading-none">Hay una versión nueva</p>
            <p className="mt-1 text-sm text-white/85">
              Actualiza para tener las mejoras. Tarda un momento.
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
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
            onClick={dismiss}
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
            {isActivating ? "Actualizando…" : "Actualizar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
