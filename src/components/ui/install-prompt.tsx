"use client";

import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Button } from "./button";
import { X } from "lucide-react";
import { useState, useEffect } from "react";

export function InstallPrompt() {
  const {
    installPrompt,
    isInstallable,
    isInstalled,
    promptInstall,
    dismissPrompt,
    isDismissed,
  } = useInstallPrompt();

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Delay showing prompt to not annoy user on first visit
    const timer = setTimeout(() => {
      setVisible(isInstallable);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isInstallable]);

  if (!isInstallable || isInstalled || isDismissed || !visible) {
    return null;
  }

  const handleInstall = async () => {
    await promptInstall();
    setVisible(false);
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-white border border-zaltyko-border rounded-2xl shadow-lg p-4">
        <button
          onClick={dismissPrompt}
          className="absolute top-2 right-2 p-1 text-zaltyko-text-muted hover:text-zaltyko-text-main"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-zaltyko-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg
              className="h-6 w-6 text-zaltyko-primary"
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

          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-zaltyko-text-main">
              Instalar Zaltyko
            </p>
            <p className="text-sm text-zaltyko-text-muted mt-0.5">
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
