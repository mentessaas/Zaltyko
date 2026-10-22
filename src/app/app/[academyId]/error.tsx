"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary compartido para `/app/[academyId]/...`.
 *
 * Cubre ~60 rutas del árbol de academia que antes no tenían `error.tsx`
 * propio (la excepción son `coach/today-simple/` y `dashboard/at-a-glance/`
 * que tienen boundaries locales más específicos). Se activa cuando un
 * descendiente lanza — preserva `academyId` en la URL y nunca expone el
 * stack, solo el `digest` para correlación con logs de servidor.
 */
export default function AcademySectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window !== "undefined" && error.digest) {
      // eslint-disable-next-line no-console
      console.warn("academy section boundary caught:", error.digest);
    }
  }, [error]);

  return (
    <main
      role="alert"
      className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6"
      data-testid="academy-section-error"
    >
      <h1 className="text-xl font-semibold text-foreground dark:text-slate-50">
        No pudimos cargar esta sección
      </h1>
      <p className="text-sm text-muted-foreground dark:text-slate-300">
        Tus datos están a salvo; la consulta falló de forma puntual. Puedes
        reintentar la carga o volver al panel principal. Si el problema
        continúa, escríbenos desde soporte.
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
          className="rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Volver al panel
        </Link>
        <Link
          href="../support"
          className="rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Contactar soporte
        </Link>
      </div>
    </main>
  );
}
