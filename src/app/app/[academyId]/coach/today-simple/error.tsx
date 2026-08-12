"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary local para `/app/[academyId]/coach/today-simple`.
 * Preserva `academyId` en la URL y ofrece reintento sin filtrar stack.
 */
export default function CoachTodaySimpleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window !== "undefined" && error.digest) {
      // eslint-disable-next-line no-console
      console.warn("coach-today-simple boundary caught:", error.digest);
    }
  }, [error]);

  return (
    <main
      role="alert"
      className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6"
      data-testid="coach-today-simple-error"
    >
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        No pudimos cargar tu panel del día
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Tus datos están a salvo; la consulta se puede reintentar. Si el
        problema continúa, contacta con el dueño de la academia.
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
          href="../coach"
          className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Volver a mi panel
        </Link>
      </div>
    </main>
  );
}
