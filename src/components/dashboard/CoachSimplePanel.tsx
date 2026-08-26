/**
 * Panel del coach — vista simple y read-only.
 *
 * Server Component. Renderiza el subset del bundle: clases de hoy,
 * asistencia pendiente y mensajes. NO expone cobros, import, ni enlaces a
 * billing/permisos de owner. Esto cumple ZAL-619 §4 "Coach no puede hacer
 * billing, checkout, importación, configuración administrativa" y la
 * matriz de la propia ZAL-624.
 *
 * Si una fuente cayó (`sourceAvailable: false`), la UI muestra "Fuente no
 * disponible" en lugar de un cero inventado (ZAL-619 §3.2).
 */

import { AttentionBlock } from "./AttentionBlock";
import { PriorityActionPanel } from "./PriorityAction";
import type {
  CoachAttentionBundle,
  TodaySessionAttention,
} from "@/lib/dashboard/attention-types";

export interface CoachSimplePanelProps {
  bundle: CoachAttentionBundle;
  academyName: string | null;
  profileName: string | null;
}

function formatHour(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function TodaySessionList({ sessions }: { sessions: TodaySessionAttention[] }) {
  if (sessions.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground dark:text-muted-foreground"
        data-testid="coach-today-empty"
      >
        No tienes clases programadas para hoy. Si esperas alguna, habla con
        el dueño o el director de la academia.
      </p>
    );
  }
  return (
    <ul
      className="divide-y divide-border dark:divide-slate-800"
      data-testid="coach-today-list"
    >
      {sessions.map((session) => (
        <li
          key={session.sessionId}
          className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium text-foreground dark:text-slate-50">
              {session.className ?? "Clase sin nombre"}
            </p>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground">
              {formatHour(session.startsAt)}
            </p>
          </div>
          <a
            href={session.href}
            className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-label={`Pasar lista de ${session.className ?? "la clase"} de las ${formatHour(session.startsAt)}`}
          >
            Pasar lista
          </a>
        </li>
      ))}
    </ul>
  );
}

export function CoachSimplePanel({
  bundle,
  academyName,
  profileName,
}: CoachSimplePanelProps) {
  const headerSubtitle = profileName
    ? `Hola, ${profileName}. Esta es tu vista rápida para hoy en ${academyName ?? "tu academia"}.`
    : `Esta es tu vista rápida para hoy en ${academyName ?? "tu academia"}.`;

  return (
    <main
      aria-labelledby="coach-simple-title"
      className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6"
    >
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
          Modo simple · {bundle.date}
        </p>
        <h1
          id="coach-simple-title"
          className="mt-1 text-2xl font-semibold text-foreground dark:text-slate-50"
        >
          Lo que tienes que hacer hoy
        </h1>
        <p className="mt-1 text-sm text-muted-foreground dark:text-slate-300">
          {headerSubtitle}
        </p>
      </header>

      <PriorityActionPanel action={bundle.priorityAction} />

      <section aria-labelledby="coach-today-title">
        <h2
          id="coach-today-title"
          className="mb-3 text-lg font-semibold text-foreground dark:text-slate-50"
        >
          Tus clases de hoy
        </h2>
        <div className="rounded-2xl border border-border bg-card p-4 dark:border-slate-700 dark:bg-slate-900">
          <TodaySessionList sessions={bundle.today} />
        </div>
      </section>

      <section aria-labelledby="coach-kpis-title">
        <h2
          id="coach-kpis-title"
          className="mb-3 text-lg font-semibold text-foreground dark:text-slate-50"
        >
          Resumen
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AttentionBlock
            id="coach-attendance-pending"
            title="Asistencia pendiente"
            value={bundle.attendancePending.sourceAvailable ? bundle.attendancePending.count : null}
            subtitle="Sesiones de hoy sin lista pasada"
            href={bundle.attendancePending.href}
            sourceAvailable={bundle.attendancePending.sourceAvailable}
            source={bundle.attendancePending.source}
            ctaLabel="Ir a la lista de asistencia pendiente"
            tone={bundle.attendancePending.count > 0 ? "primary" : "secondary"}
          />
          <AttentionBlock
            id="coach-messages-pending"
            title="Mensajes"
            value={
              bundle.messagesPending.sourceAvailable
                ? bundle.messagesPending.failed
                : null
            }
            subtitle={
              bundle.messagesPending.sourceAvailable
                ? `${bundle.messagesPending.failed} fallidos · ${bundle.messagesPending.unsent} atrasados`
                : null
            }
            href={bundle.messagesPending.href}
            sourceAvailable={bundle.messagesPending.sourceAvailable}
            source={bundle.messagesPending.source}
            ctaLabel="Revisar mensajes fallidos"
            tone={bundle.messagesPending.failed > 0 ? "primary" : "secondary"}
          />
        </div>
      </section>

      <p className="text-xs text-muted-foreground dark:text-muted-foreground">
        Este panel es de solo lectura para tu rol. Para tareas administrativas
        (cobros, permisos, importación), contacta con el dueño de la academia.
      </p>
    </main>
  );
}
