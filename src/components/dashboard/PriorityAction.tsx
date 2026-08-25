/**
 * Bloque destacado de la "acción prioritaria" del bundle.
 *
 * Server Component. Si el bundle no tiene acción prioritaria
 * (`priorityAction === null`), muestra un mensaje honesto
 * "Sin acción prioritaria" sin claim cuantitativo.
 */

import Link from "next/link";

import type { PriorityAction } from "@/lib/dashboard/attention-types";

export interface PriorityActionPanelProps {
  action: PriorityAction | null;
}

export function PriorityActionPanel({ action }: PriorityActionPanelProps) {
  if (!action) {
    return (
      <section
        aria-labelledby="priority-title"
        className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 dark:border-emerald-900/40 dark:bg-emerald-900/10"
        data-testid="priority-action-empty"
      >
        <h2
          id="priority-title"
          className="text-sm font-medium text-emerald-900 dark:text-emerald-100"
        >
          Sin acción prioritaria
        </h2>
        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
          No hemos detectado tareas urgentes a primera hora. Sigue con tu
          recorrido normal.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="priority-title"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-900/20"
      data-testid="priority-action"
      data-priority-kind={action.kind}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        Acción prioritaria
      </p>
      <h2
        id="priority-title"
        className="mt-1 text-xl font-semibold text-amber-900 dark:text-amber-50"
      >
        {action.label}
      </h2>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
        Fuente: {action.source}
      </p>
      <div className="mt-4">
        <Link
          href={action.href}
          className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
          aria-label={`Ir a ${action.label}`}
        >
          Atender ahora →
        </Link>
      </div>
    </section>
  );
}
