import { CalendarDays, Sparkles, UsersRound, Wallet } from "lucide-react";

import type { OwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";
import { ownerUi } from "./owner-ui";

function formatPeriodDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function OwnerOperationalSummaryPanel({
  summary,
}: {
  summary: OwnerOperationalSummary | null;
}) {
  if (!summary) {
    return (
      <section
        aria-labelledby="operational-summary-unavailable-title"
        className={`mt-6 ${ownerUi.noticeWarning} p-5 sm:p-6`}
      >
        <h2
          id="operational-summary-unavailable-title"
          className="font-display text-lg font-bold text-ochre-ink"
        >
          Resumen operativo no disponible
        </h2>
        <p className="mt-1 text-sm">
          No pudimos consultar la actividad. No significa que no haya datos.
        </p>
      </section>
    );
  }

  const { metrics, period, scope } = summary;
  const payments = metrics.paymentsReceived;
  return (
    <section
      aria-labelledby="operational-summary-title"
      className="mt-6 min-w-0"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="operational-summary-title" className={ownerUi.sectionTitle}>
          Tu academia en marcha
        </h2>
        <p className="text-xs text-z-soft">
          {scope.label} · Todos los programas y grupos de este ámbito.
        </p>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="operational-summary-current-title" className="min-w-0">
          <h3 id="operational-summary-current-title" className="sr-only">
            Ahora
          </h3>
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className={ownerUi.metricCard}>
              <dt className={`flex items-center justify-between gap-2 ${ownerUi.metricLabel}`}>
                Gimnastas activos hoy
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              </dt>
              <dd className={`zk-settle break-words ${ownerUi.metricValue}`}>
                {metrics.activeAthletes}
              </dd>
              <p className="mt-1 text-xs text-z-soft">
                Con pertenencia vigente a un grupo activo, sin duplicados.
              </p>
            </div>
            <div className={ownerUi.metricCard}>
              <dt className={`flex items-center justify-between gap-2 ${ownerUi.metricLabel}`}>
                Grupos activos hoy
                <UsersRound className="h-4 w-4 shrink-0" aria-hidden="true" />
              </dt>
              <dd className={`zk-settle break-words ${ownerUi.metricValue}`}>
                {metrics.activeGroups}
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="operational-summary-period-title"
          className={`min-w-0 ${ownerUi.metricCard}`}
        >
          <div className="flex items-center justify-between gap-2">
            <h3
              id="operational-summary-period-title"
              className={ownerUi.metricLabel}
            >
              En este periodo
            </h3>
            <CalendarDays className="h-4 w-4 shrink-0 text-z-soft" aria-hidden="true" />
          </div>
          <dl>
            <div>
              <dt className="mt-1 text-xs text-z-soft">
                Registros de asistencia
              </dt>
              <dd className={`zk-settle break-words ${ownerUi.metricValue}`}>
                {metrics.attendanceRecords}
              </dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-z-soft">
            {formatPeriodDate(period.from)} – {formatPeriodDate(period.to)}
          </p>
          <p className="mt-1 text-xs text-z-soft">
            Incluye las marcas registradas, no solo presentes. Fechas según la zona horaria de cada sede.
          </p>
        </section>

        <section
          aria-labelledby="operational-summary-payments-title"
          className={`min-w-0 ${ownerUi.metricCard} xl:col-span-2`}
        >
          <div className="flex items-center justify-between gap-2">
            <h3
              id="operational-summary-payments-title"
              className={ownerUi.metricLabel}
            >
              Cobros recibidos en este periodo
            </h3>
            <Wallet className="h-4 w-4 shrink-0 text-z-soft" aria-hidden="true" />
          </div>
          {payments.state === "available" ? (
            <>
              <dl className="mt-1 grid min-w-0 gap-x-8 gap-y-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
                <div>
                  <dt className="text-xs text-z-soft">Cobros</dt>
                  <dd className={`zk-settle break-words ${ownerUi.metricValue}`}>
                    {payments.count}
                  </dd>
                </div>
                {payments.grossByCurrency.map(({ currency, amountCents }) => (
                  <div key={currency}>
                    <dt className="text-xs text-z-soft">
                      Total bruto en {currency}
                    </dt>
                    <dd className={`zk-settle break-words ${ownerUi.metricValue}`}>
                      {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency,
                      }).format(amountCents / 100)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-z-soft">
                Bruto recibido sin descontar devoluciones; no es beneficio ni
                saldo.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-z-soft">
              Tu rol no permite ver los cobros de este periodo.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
