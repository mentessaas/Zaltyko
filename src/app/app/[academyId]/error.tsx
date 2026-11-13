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
      className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6"
      data-testid="academy-section-error"
    >
      <h1 className="border-b-[3px] border-mat-night pb-5 font-display text-[clamp(2rem,3.5vw,3rem)] font-black uppercase leading-[0.95] text-mat-night dark:border-chalk-dust dark:text-chalk">
        No pudimos cargar esta sección
      </h1>
      <p className="max-w-2xl text-sm leading-relaxed text-ramp-600 dark:text-ramp-300">
        Tus datos están a salvo; la consulta falló de forma puntual. Puedes
        reintentar la carga o volver al panel principal. Si el problema
        continúa, escríbenos desde soporte.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-md bg-mat px-6 py-2.5 font-semibold text-white shadow-[0_1px_0_rgba(11,20,48,0.25)] transition-colors hover:bg-mat-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-mat focus-visible:ring-offset-2"
        >
          Reintentar
        </button>
        <Link
          href="../dashboard"
          className="inline-flex min-h-11 items-center rounded-md border border-ramp-300 bg-white px-6 py-2.5 font-semibold text-mat-night transition-colors hover:border-mat hover:text-mat focus:outline-none focus-visible:ring-2 focus-visible:ring-mat focus-visible:ring-offset-2 dark:border-border dark:bg-card dark:text-foreground"
        >
          Volver al panel
        </Link>
        <Link
          href="../support"
          className="inline-flex min-h-11 items-center rounded-md border border-ramp-300 bg-white px-6 py-2.5 font-semibold text-mat-night transition-colors hover:border-mat hover:text-mat focus:outline-none focus-visible:ring-2 focus-visible:ring-mat focus-visible:ring-offset-2 dark:border-border dark:bg-card dark:text-foreground"
        >
          Contactar soporte
        </Link>
      </div>
    </main>
  );
}
