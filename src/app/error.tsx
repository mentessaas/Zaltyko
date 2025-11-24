"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error using logger and Sentry
    logger.error("Application error", error, {
      digest: error.digest,
      component: "ErrorBoundary",
    });
    
    // Capture to Sentry
    Sentry.captureException(error, {
      tags: {
        component: "ErrorBoundary",
        digest: error.digest,
      },
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4 text-center">
        <h1 className="text-2xl font-bold">Algo salió mal</h1>
        <p className="text-muted-foreground">
          Ha ocurrido un error inesperado. Por favor, intenta recargar la página.
        </p>
        {process.env.NODE_ENV === "development" && error.message && (
          <div className="rounded-lg border border-red-500/50 bg-red-50 p-4 text-left">
            <p className="text-sm font-semibold text-red-800">Error:</p>
            <p className="text-xs text-red-600 mt-1">{error.message}</p>
          </div>
        )}
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Intentar de nuevo
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  );
}

