"use client";

import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Button } from "./button";
import { X } from "lucide-react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export function InstallPrompt() {
  const pathname = usePathname();
  const {
    installPrompt,
    isInstallable,
    isInstalled,
    promptInstall,
    dismissPrompt,
    isDismissed,
  } = useInstallPrompt();

  const [visible, setVisible] = useState(false);
  const isAuthRoute = pathname === "/login" || pathname?.startsWith("/auth/");
  const isAuthenticatedAppRoute =
    pathname?.startsWith("/app/") ||
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/super-admin");
  const isSuppressedRoute = isAuthRoute || isAuthenticatedAppRoute;

  useEffect(() => {
    if (isSuppressedRoute) {
      setVisible(false);
      return;
    }

    // Delay showing prompt to not annoy user on first visit
    const timer = setTimeout(() => {
      setVisible(isInstallable);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isSuppressedRoute, isInstallable]);

  if (isSuppressedRoute || !isInstallable || isInstalled || isDismissed || !visible) {
    return null;
  }

  const handleInstall = async () => {
    await promptInstall();
    setVisible(false);
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="relative rounded-xl border border-chalk-line bg-white p-4 text-mat-night shadow-medium">
        <button
          type="button"
          onClick={dismissPrompt}
          className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-ramp-600 transition-colors hover:bg-chalk hover:text-mat-night"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-mat-wash">
            <svg
              aria-hidden="true"
              className="h-5 w-5 text-mat"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 18h-3a1 1 0 01-1-1v-3a1 1 0 011-1h3m4 0h3a1 1 0 011 1v3a1 1 0 01-1 1h-3m-8 0h3a1 1 0 011 1v3a1 1 0 01-1 1h-3M9 12h6m-3 0a3 3 0 01-6 0m6 0a3 3 0 016 0"
              />
            </svg>
          </div>

          <div className="min-w-0 flex-1 pr-8">
            <p className="font-display text-lg font-black uppercase leading-none text-mat-night">
              Instalar Zaltyko
            </p>
            <p className="mt-1 text-sm text-ramp-600">
              Accede más rápido desde tu pantalla de inicio
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={dismissPrompt}
            className="flex-1"
          >
            Ahora no
          </Button>
          <Button size="sm" onClick={handleInstall} className="flex-1">
            Instalar
          </Button>
        </div>
      </div>
    </div>
  );
}
