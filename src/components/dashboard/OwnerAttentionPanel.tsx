/**
 * Panel del dueño para el dashboard operativo.
 *
 * Server Component. Renderiza el bundle agregado por el server: la página
 * `/app/[academyId]/dashboard/at-a-glance/page.tsx` lo llama pasando
 * `getOwnerAttentionBundle` como prop `loader`. Esto evita el anti-patrón
 * de `fetch` client-side contra la propia API sin cookies (ZAL-588) y
 * mantiene la paridad de payload con Mobile.
 *
 * Si una fuente cayó (`sourceAvailable: false`), la sección se renderiza
 * con el placeholder "Fuente no disponible" — nunca con un cero inventado.
 */

import { AttentionBlock } from "./AttentionBlock";
import { PriorityActionPanel } from "./PriorityAction";
import type {
  OwnerAttentionBundle,
  TodaySessionAttention,
} from "@/lib/dashboard/attention-types";

export interface OwnerAttentionPanelProps {
  bundle: OwnerAttentionBundle;
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
      <p className="text-sm text-muted-foreground dark:text-muted-foreground" data-testid="today-empty">
        No hay clases programadas para hoy. Si esperas alguna, revisa la
        planificación de la semana.
      </p>
    );
  }
  return (
    <ul
      className="divide-y divide-border dark:divide-slate-800"
      data-testid="today-list"
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
              {session.groupName ? ` · ${session.groupName}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {session.attendanceRecorded ? (
              <span
                className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                aria-label="Asistencia registrada"
              >
                Lista pasada
              </span>
            ) : (
              <span
                className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                aria-label="Asistencia pendiente"
              >
                Pendiente
              </span>
            )}
            <a
              href={session.href}
              className="font-medium text-sky-700 hover:underline focus:outline-none focus-visible:underline dark:text-sky-300"
            >
              Abrir
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OwnerAttentionPanel({
  bundle,
  academyName,
  profileName,
}: OwnerAttentionPanelProps) {
  const headerSubtitle = profileName
    ? `Buenos días, ${profileName}. Esto es lo que ${academyName ?? "tu academia"} necesita ahora mismo.`
    : `Esto es lo que ${academyName ?? "tu academia"} necesita ahora mismo.`;

  const hasOverdueAction =
    bundle.chargesOverdue.overdue + bundle.chargesOverdue.failed > 0;

  return (
    <main
      aria-labelledby="owner-attention-title"
      className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6"
    >
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
          Panel del dueño · {bundle.date}
        </p>
        <h1
          id="owner-attention-title"
          className="mt-1 text-2xl font-semibold text-foreground dark:text-slate-50"
        >
          Tu academia de un vistazo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground dark:text-slate-300">
          {headerSubtitle}
        </p>
      </header>

      <PriorityActionPanel action={bundle.priorityAction} />

      <section aria-labelledby="today-title">
        <h2
          id="today-title"
          className="mb-3 text-lg font-semibold text-foreground dark:text-slate-50"
        >
          Clases de hoy
        </h2>
        <div className="rounded-2xl border border-border bg-card p-4 dark:border-slate-700 dark:bg-slate-900">
          <TodaySessionList sessions={bundle.today} />
        </div>
      </section>

      <section aria-labelledby="kpis-title">
        <h2
          id="kpis-title"
          className="mb-3 text-lg font-semibold text-foreground dark:text-slate-50"
        >
          Indicadores
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AttentionBlock
            id="attendance-pending"
            title="Asistencia pendiente"
            value={bundle.attendancePending.sourceAvailable ? bundle.attendancePending.count : null}
            subtitle="Sesiones de hoy sin registro de lista"
            href={bundle.attendancePending.href}
            sourceAvailable={bundle.attendancePending.sourceAvailable}
            source={bundle.attendancePending.source}
            ctaLabel="Ir a la lista de asistencia pendiente"
            tone={bundle.attendancePending.count > 0 ? "primary" : "secondary"}
          />
          <AttentionBlock
            id="messages-pending"
            title="Mensajes"
            value={
              bundle.messagesPending.sourceAvailable
                ? bundle.messagesPending.failed
                : null
            }
            subtitle={
              bundle.messagesPending.sourceAvailable
                ? `${bundle.messagesPending.failed} fallidos · ${bundle.messagesPending.unsent} atrasados · ${bundle.messagesPending.unread} sin leer`
                : null
            }
            href={bundle.messagesPending.href}
            sourceAvailable={bundle.messagesPending.sourceAvailable}
            source={bundle.messagesPending.source}
            ctaLabel="Revisar mensajes fallidos"
            tone={bundle.messagesPending.failed > 0 ? "primary" : "secondary"}
          />
          <AttentionBlock
            id="charges-overdue"
            title="Cargos vencidos o fallidos"
            value={
              bundle.chargesOverdue.sourceAvailable
                ? bundle.chargesOverdue.overdue + bundle.chargesOverdue.failed
                : null
            }
 subtitle={
              bundle.chargesOverdue.sourceAvailable
                ? `${bundle.chargesOverdue.overdue} vencidos · ${bundle.chargesOverdue.failed} fallidos`
                : null
            }
            href={hasOverdueAction ? bundle.chargesOverdue.href : null}
            sourceAvailable={bundle.chargesOverdue.sourceAvailable}
            source={bundle.chargesOverdue.source}
            ctaLabel="Revisar cargos pendientes"
            tone={hasOverdueAction ? "primary" : "secondary"}
          />
          <AttentionBlock
            id="progress-drafts"
            title="Evaluaciones en borrador"
            value={bundle.progressDrafts.sourceAvailable ? bundle.progressDrafts.count : null}
            subtitle="Pendientes de publicar para que las familias las vean"
            href={bundle.progressDrafts.href}
            sourceAvailable={bundle.progressDrafts.sourceAvailable}
            source={bundle.progressDrafts.source}
            ctaLabel="Publicar evaluaciones pendientes"
            tone={bundle.progressDrafts.count > 0 ? "primary" : "secondary"}
          />
        </div>
      </section>

      <section aria-labelledby="overdue-detail-title">
        <h2
          id="overdue-detail-title"
          className="mb-3 text-lg font-semibold text-foreground dark:text-slate-50"
        >
          Cargos pendientes (top {bundle.chargesOverdue.items.length})
        </h2>
        {bundle.chargesOverdue.sourceAvailable ? (
          bundle.chargesOverdue.items.length === 0 ? (
            <p
              className="text-sm text-muted-foreground dark:text-muted-foreground"
              data-testid="charges-empty"
            >
              No hay cargos pendientes.
            </p>
          ) : (
            <ul
              className="divide-y divide-border rounded-2xl border border-border bg-card dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900"
              data-testid="charges-list"
            >
              {bundle.chargesOverdue.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-4 text-sm"
                >
                  <div>
                    <p className="font-medium text-foreground dark:text-slate-50">
                      {item.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                      {item.dueDate ? `Vencimiento: ${item.dueDate}` : "Sin fecha"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums text-foreground dark:text-slate-50">
                      {(item.amountCents / 100).toLocaleString("es-ES", {
                        style: "currency",
                        currency: item.currency || "EUR",
                      })}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        item.status === "failed"
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      }`}
                    >
                      {item.status === "failed" ? "Fallido" : "Vencido"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p
            className="text-sm text-muted-foreground dark:text-muted-foreground"
            data-testid="charges-source-unavailable"
          >
            Fuente no disponible. Reintenta o contacta con soporte.
          </p>
        )}
      </section>

      <p className="text-xs text-muted-foreground dark:text-muted-foreground">
        Este panel se alimenta de las fuentes declaradas en cada bloque y se
        actualiza al recargar la página. Las cifras no son engagement ni
        adopción: son tareas operativas concretas.
      </p>
    </main>
  );
}
