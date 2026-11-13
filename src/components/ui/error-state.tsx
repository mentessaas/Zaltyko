"use client";

import { useEffect, useState, useCallback, ReactNode } from "react";
import { WifiOff, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Estados de sistema «Magnesio sobre tapiz»: cuadro de icono de 40 px a 6 px
// de radio (no círculo), título en voz *panel title* y texto en `ramp-600`.
// Error en señal (`signal-wash` / `signal-ink`); sin conexión es un aviso en
// ocre (`ochre-wash` / `ochre-ink`), no un error.
const stateTitleClassName =
  "mb-2 font-display text-2xl font-black uppercase leading-none text-mat-night";
const stateTextClassName = "mb-6 max-w-sm text-sm text-ramp-600";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Algo salió mal",
  message = "Ha ocurrido un error inesperado. Por favor, inténtalo de nuevo.",
  onRetry,
  className,
}: ErrorStateProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    if (!onRetry) return;

    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }, [onRetry]);

  return (
    <div
      className={cn("flex flex-col items-center justify-center p-8 text-center", className)}
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-signal-wash">
        <AlertCircle className="h-5 w-5 text-signal-ink" aria-hidden="true" />
      </div>
      <h3 className={stateTitleClassName}>{title}</h3>
      <p className={stateTextClassName}>{message}</p>
      {onRetry && (
        <Button
          onClick={handleRetry}
          disabled={isRetrying}
          className="touch-target"
        >
          {isRetrying ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Intentar de nuevo
        </Button>
      )}
    </div>
  );
}

interface OfflineStateProps {
  className?: string;
  children?: ReactNode;
}

export function OfflineState({ className, children }: OfflineStateProps) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) {
    return <>{children}</>;
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-3 border-b border-ochre-line bg-ochre-wash px-4 py-3">
        <WifiOff className="h-5 w-5 flex-shrink-0 text-ochre-ink" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-ochre-ink">
            Sin conexión
          </p>
          <p className="text-xs text-ochre-ink">
            Puedes seguir navegando. Algunos datos pueden estar desactualizados.
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({
  message = "Cargando...",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center p-8", className)}
    >
      <RefreshCw className="mb-4 h-8 w-8 animate-spin text-mat" aria-hidden="true" />
      <p className="text-sm text-ramp-600">{message}</p>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center p-8 text-center", className)}
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-chalk-dust">
        <AlertCircle className="h-5 w-5 text-ramp-500" aria-hidden="true" />
      </div>
      <h3 className={stateTitleClassName}>{title}</h3>
      {description && <p className={stateTextClassName}>{description}</p>}
      {action}
    </div>
  );
}
