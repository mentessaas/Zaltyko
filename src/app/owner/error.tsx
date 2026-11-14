"use client";

import { useEffect } from "react";

import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
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
      <section className="max-w-xl rounded-md border border-z-line border-t-[3px] border-t-signal-ink bg-white p-8">
        <PageHeader
          title="No hemos podido cargar este cierre"
          description="No sustituimos el fallo por ceros ni por una vista vacía. Puedes volver a intentarlo sin perder el filtro actual."
          className="border-b-0 pb-0"
        />
        <button
          type="button"
          onClick={reset}
          className={`${ownerUi.primaryButton} mt-7`}
        >
          Reintentar
        </button>
      </section>
    </main>
  );
}
