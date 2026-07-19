"use client";

import { useEffect, useState, useCallback, ReactNode } from "react";
import { WifiOff, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      className={`flex flex-col items-center justify-center p-8 text-center ${className}`}
    >
      <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-full mb-4">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-sm">
        {message}
      </p>
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
      <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center gap-3">
        <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Sin conexión
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-300">
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
      className={`flex flex-col items-center justify-center p-8 ${className}`}
    >
      <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-4" />
      <p className="text-gray-500 dark:text-gray-400 text-sm">{message}</p>
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
      className={`flex flex-col items-center justify-center p-8 text-center ${className}`}
    >
      <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full mb-4">
        <AlertCircle className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-sm">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
