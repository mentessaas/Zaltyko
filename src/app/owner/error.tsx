"use client";

import { useEffect } from "react";

import { logger } from "@/lib/logger";

export default function OwnerDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Owner dashboard render failed", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-z-canvas px-5 py-16 text-z-ink">
      <section className="max-w-xl border-l-4 border-zaltyko-coral bg-white p-8 shadow-soft">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#A33A2D]">
          Panel no disponible
        </p>
        <h1 className="mt-3 text-3xl">No hemos podido cargar este cierre</h1>
        <p className="mt-4 text-z-soft">
          No sustituimos el fallo por ceros ni por una vista vacía. Puedes
          volver a intentarlo sin perder el filtro actual.
        </p>
        <button
          type="button"
          onClick={reset}
          className="touch-target mt-7 bg-z-ink px-5 py-3 text-sm font-bold text-white"
        >
          Reintentar
        </button>
      </section>
    </main>
  );
}
