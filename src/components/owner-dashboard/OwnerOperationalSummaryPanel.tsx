import type { OwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";

export function OwnerOperationalSummaryPanel({
  summary,
}: {
  summary: OwnerOperationalSummary | null;
}) {
  if (!summary) {
    return (
      <section
        aria-label="Resumen operativo"
        className="mt-6 border border-amber-300 bg-amber-50 p-5"
      >
        <h2 className="text-xl text-slate-950">
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
      <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
        <div>
          <dt className="text-sm text-slate-600">Registros de asistencia</dt>
          <dd className="mt-1 text-3xl font-semibold text-slate-950">
            {metrics.attendanceRecords}
          </dd>
          <p className="mt-1 text-xs text-slate-600">
            Incluye las marcas registradas, no solo presentes.
          </p>
        </div>
        <div>
          <dt className="text-sm text-slate-600">Cobros recibidos</dt>
          <dd className="mt-1 text-slate-950">
            {payments.state === "available" ? (
              <>
                <span className="text-3xl font-semibold">{payments.count}</span>
                {payments.grossByCurrency.map(({ currency, amountCents }) => (
                  <span
                    key={currency}
                    className="mt-1 block text-lg font-semibold"
                  >
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency,
                    }).format(amountCents / 100)}
                  </span>
                ))}
              </>
            ) : (
              "Necesitas permiso financiero"
            )}
          </dd>
          {payments.state === "available" && (
            <p className="mt-1 text-xs text-slate-600">
              Bruto recibido sin descontar devoluciones; no es beneficio ni
              saldo.
            </p>
          )}
        </div>
      </dl>
      <p className="mt-5 border-t border-slate-200 pt-3 text-xs text-slate-600">
        Asistencia y cobros: {period.from} a {period.to}, inclusive. Fechas
        según la zona horaria de cada sede.
      </p>
    </section>
  );
}
