"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary local para `/app/[academyId]/dashboard/at-a-glance`.
 *
 * Cumple el hallazgo de ZAL-621 §1 (0/10 rutas P0 tenían `error.tsx`
 * propio) y respeta ZAL-619 AC-10: ofrece siguiente acción sin exponer
 * stack trace ni secretos, y preserva `academyId` en la URL.
 */
export default function OwnerAtAGlanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window !== "undefined" && error.digest) {
      // Log del digest para correlación con el servidor; nunca se imprime
      // el stack en producción.
      // eslint-disable-next-line no-console
      console.warn("at-a-glance boundary caught:", error.digest);
    }
  }, [error]);

  return (
    <main
      role="alert"
      className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6"
      data-testid="at-a-glance-error"
    >
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        No pudimos cargar tu panel
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        La consulta al panel de atención falló. Tus datos están a salvo;
        puedes reintentar o volver al panel anterior.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-sky-700 px-4 py-2 font-medium text-white shadow-sm hover:bg-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          Reintentar
        </button>
        <Link
          href="../dashboard"
          className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Volver al panel anterior
        </Link>
        <Link
          href="../support"
          className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Contactar soporte
        </Link>
      </div>
    </main>
  );
}
