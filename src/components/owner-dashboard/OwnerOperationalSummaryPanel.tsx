import type { OwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";

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
        className="mt-6 border border-amber-300 bg-amber-50 p-5"
      >
        <h2
          id="operational-summary-unavailable-title"
          className="text-xl text-slate-950"
        >
          Resumen operativo no disponible
        </h2>
        <p className="mt-2 text-sm text-slate-700">
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
      className="mt-6 border-t-4 border-teal-700 bg-white p-5 sm:p-7"
    >
      <h2 id="operational-summary-title" className="text-2xl text-slate-950">
        Tu academia en marcha
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        {scope.label} · Todos los programas y grupos de este ámbito.
      </p>
      <div className="mt-5 grid gap-6">
        <section aria-labelledby="operational-summary-current-title">
          <h3
            id="operational-summary-current-title"
            className="text-base font-semibold text-slate-950"
          >
            Ahora
          </h3>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-slate-600">Gimnastas activos hoy</dt>
              <dd className="mt-1 text-3xl font-semibold text-slate-950">
                {metrics.activeAthletes}
              </dd>
              <p className="mt-1 text-xs text-slate-600">
                Con pertenencia vigente a un grupo activo, sin duplicados.
              </p>
            </div>
            <div>
              <dt className="text-sm text-slate-600">Grupos activos hoy</dt>
              <dd className="mt-1 text-3xl font-semibold text-slate-950">
                {metrics.activeGroups}
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="operational-summary-period-title"
          className="border-t border-slate-200 pt-4"
        >
          <h3
            id="operational-summary-period-title"
            className="text-base font-semibold text-slate-950"
          >
            En este periodo
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {formatPeriodDate(period.from)} – {formatPeriodDate(period.to)}
          </p>
          <dl className="mt-3">
            <div>
              <dt className="text-sm text-slate-600">
                Registros de asistencia
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-slate-950">
                {metrics.attendanceRecords}
              </dd>
              <p className="mt-1 text-xs text-slate-600">
                Incluye las marcas registradas, no solo presentes.
              </p>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-600">
            Fechas según la zona horaria de cada sede.
          </p>
        </section>

        <section
          aria-labelledby="operational-summary-payments-title"
          className="border-t border-slate-200 pt-4"
        >
          <h3
            id="operational-summary-payments-title"
            className="text-base font-semibold text-slate-950"
          >
            Cobros recibidos en este periodo
          </h3>
          {payments.state === "available" ? (
            <>
              <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-slate-600">Cobros</dt>
                  <dd className="mt-1 text-3xl font-semibold text-slate-950">
                    {payments.count}
                  </dd>
                </div>
                {payments.grossByCurrency.map(({ currency, amountCents }) => (
                  <div key={currency}>
                    <dt className="text-sm text-slate-600">
                      Total bruto en {currency}
                    </dt>
                    <dd className="mt-1 text-xl font-semibold text-slate-950">
                      {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency,
                      }).format(amountCents / 100)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-slate-600">
                Bruto recibido sin descontar devoluciones; no es beneficio ni
                saldo.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-700">
              Tu rol no permite ver los cobros de este periodo.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
