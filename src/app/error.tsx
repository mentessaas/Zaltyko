"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger, redactError, redactSensitive } from "@/lib/logger";
import { SystemStatusPage, systemPageUi } from "@/components/system/SystemStatusPage";

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
    Sentry.captureException(redactError(error), {
      tags: {
        component: "ErrorBoundary",
        digest: error.digest,
      },
      extra: redactSensitive({
        component: "ErrorBoundary",
        digest: error.digest,
      }),
    });
  }, [error]);

  return (
    <SystemStatusPage
      title="Algo salió mal"
      description={<p>Ha ocurrido un error inesperado. Por favor, intenta recargar la página.</p>}
      actions={
        <>
          <button type="button" onClick={reset} className={systemPageUi.primary}>
            Intentar de nuevo
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className={systemPageUi.outline}
          >
            Ir al inicio
          </button>
        </>
      }
    >
      {process.env.NODE_ENV === "development" && error.message && (
        <div className="mt-6 rounded-[10px] border border-signal/30 bg-signal-wash p-4 text-left">
          <p className="text-sm font-semibold text-signal-ink">Error:</p>
          <p className="mt-1 text-xs text-signal-ink">{error.message}</p>
        </div>
      )}
    </SystemStatusPage>
  );
}
