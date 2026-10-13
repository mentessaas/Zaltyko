import Link from "next/link";
import { OwnerOperationalSummaryPanel } from "./OwnerOperationalSummaryPanel";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Gauge,
  MapPin,
  Sparkles,
  UsersRound,
} from "lucide-react";

import type { OwnerDashboardBundle } from "@/modules/owner-dashboard/application/get-owner-dashboard";
import type { getCapacityHeatmap } from "@/modules/owner-dashboard/application/capacity-heatmap";
import type { getRetentionCohorts } from "@/modules/owner-dashboard/application/retention-cohorts";
import type { OwnerDashboardLayout } from "@/modules/owner-dashboard/application/dashboard-layout";
import { DEFAULT_OWNER_DASHBOARD_ORDER } from "@/modules/owner-dashboard/domain/dashboard-layout";
import {
  DashboardModule,
  DashboardModuleLayout,
} from "@/components/owner-dashboard/DashboardModuleLayout";

type CapacityBundle = Awaited<ReturnType<typeof getCapacityHeatmap>>;
type CohortsBundle = Awaited<ReturnType<typeof getRetentionCohorts>>;
type DashboardFilters = {
  programs: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; programId: string | null }>;
  selectedProgramId: string | null;
  selectedGroupId: string | null;
};

const statusLabels: Record<string, string> = {
  critical: "Crítico",
  needs_attention: "Necesita atención",
  healthy: "Saludable",
  excellent: "Excelente",
  insufficient_data: "Datos insuficientes",
  complete: "Completo",
  partial: "Parcial",
  stale: "Atrasado",
  invalid: "Inválido",
  insufficient: "Insuficiente",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function formatMetric(
  metric: OwnerDashboardBundle["metrics"][number] | undefined
): string {
  if (!metric || metric.value === null) return "—";
  if (metric.unit === "ratio") {
    return new Intl.NumberFormat("es-ES", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(metric.value);
  }
  if (metric.unit === "currency_minor") {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: metric.currency ?? "EUR",
      maximumFractionDigits: 0,
    }).format(metric.value / 100);
  }
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(
    metric.value
  );
}

function ScoreDial({
  value,
  status,
}: {
  value: number | null;
  status: string;
}) {
  const progress = value === null ? 0 : Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 72;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <figure
      className="relative mx-auto flex w-full max-w-[18rem] items-center justify-center"
      aria-label={`Academy Health Score: ${value === null ? "datos insuficientes" : `${value.toFixed(0)} de 100, ${statusLabels[status] ?? status}`}`}
    >
      <svg
        className="h-64 w-64 -rotate-90"
        viewBox="0 0 176 176"
        role="img"
        aria-hidden="true"
      >
        <circle
          cx="88"
          cy="88"
          r="72"
          fill="none"
          stroke="#DDE4E1"
          strokeWidth="10"
        />
        <circle
          cx="88"
          cy="88"
          r="72"
          fill="none"
          stroke={value === null ? "#64748B" : "#00796B"}
          strokeLinecap="round"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
        />
      </svg>
      <figcaption className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-6xl font-semibold tracking-[-0.08em] text-slate-950">
          {value === null ? "—" : Math.round(value)}
        </span>
        <span className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
          {statusLabels[status] ?? status}
        </span>
      </figcaption>
    </figure>
  );
}

const weekdayLabels = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function OperationalEvidence({
  capacity,
  cohorts,
}: {
  capacity: CapacityBundle | null;
  cohorts: CohortsBundle | null;
}) {
  const formatMonth = (value: string) =>
    new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 7)}-01T12:00:00Z`));

  return (
    <section className="mt-12 grid gap-8 border-t border-slate-400 pt-8 xl:grid-cols-[1fr_1fr]">
      <article
        id="capacity"
        aria-labelledby="capacity-title"
        className="min-w-0"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
          Operación semanal
        </p>
        <h2 id="capacity-title" className="mt-2 text-2xl">
          Capacidad y ocupación
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Plazas ocupadas frente al aforo efectivo de cada franja, según las
          inscripciones vigentes.
        </p>
        {!capacity ? (
          <p
            role="status"
            className="mt-5 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          >
            No se pudo actualizar este resumen. El resto del panel sigue
            disponible.
          </p>
        ) : capacity.cells.length === 0 ? (
          <p className="mt-5 border border-slate-300 bg-white p-4 text-sm text-slate-600">
            No hay clases activas con horario configurado para{" "}
            {formatDate(capacity.asOf)}.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {capacity.cells.map((cell) => {
              const percent =
                cell.fillRate === null ? null : Math.round(cell.fillRate * 100);
              return (
                <details
                  key={`${cell.isoWeekday}-${cell.startsAtLocal}-${cell.endsAtLocal}`}
                  className="group border border-slate-300 bg-white"
                >
                  <summary className="touch-target flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 p-4 marker:hidden">
                    <strong className="w-10 text-sm">
                      {weekdayLabels[cell.isoWeekday]}
                    </strong>
                    <span className="font-mono text-sm tabular-nums">
                      {cell.startsAtLocal.slice(0, 5)}–
                      {cell.endsAtLocal.slice(0, 5)}
                    </span>
                    <span className="ml-auto text-right text-sm font-semibold tabular-nums">
                      {cell.capacity === 0
                        ? "Aforo sin configurar"
                        : `${cell.occupied}/${cell.capacity} plazas${percent === null ? "" : ` · ${percent}%`}`}
                    </span>
                    <span className="sr-only">, ver clases de esta franja</span>
                    <div
                      className="h-1.5 w-full bg-slate-200"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full bg-teal-700"
                        style={{ width: `${Math.min(100, percent ?? 0)}%` }}
                      />
                    </div>
                  </summary>
                  <ul className="divide-y divide-slate-200 border-t border-slate-200 px-4">
                    {cell.classes.map((item, index) => {
                      const name =
                        typeof item.name === "string"
                          ? item.name
                          : `Clase ${index + 1}`;
                      const openSeats = Number(item.openSeats ?? 0);
                      const classTemplateId =
                        typeof item.classTemplateId === "string"
                          ? item.classTemplateId
                          : null;
                      const insightParams = new URLSearchParams({
                        organizationId: capacity.organization.id,
                        entityId: classTemplateId ?? "",
                      });
                      if (capacity.scope.locationId) {
                        insightParams.set(
                          "locationId",
                          capacity.scope.locationId
                        );
                      }
                      return (
                        <li
                          key={`${name}-${index}`}
                          className="flex justify-between gap-3 py-3 text-sm"
                        >
                          <span className="min-w-0 truncate">{name}</span>
                          <span className="shrink-0 text-slate-600">
                            {Number(item.capacity ?? 0) === 0
                              ? "Aforo pendiente"
                              : `${openSeats} ${openSeats === 1 ? "plaza libre" : "plazas libres"}`}
                          </span>
                          {classTemplateId && (
                            <Link
                              href={`/owner/insights?${insightParams.toString()}`}
                              className="touch-target shrink-0 font-semibold text-teal-900 underline underline-offset-2"
                            >
                              Ver oportunidades
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
            {capacity.nextCursor && (
              <p className="text-xs text-slate-600">
                Se muestran las primeras 50 franjas; aplica filtros de ámbito
                para acotar el resumen.
              </p>
            )}
          </div>
        )}
      </article>

      <article
        id="retention"
        aria-labelledby="retention-title"
        className="min-w-0"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
          Evolución de grupos
        </p>
        <h2 id="retention-title" className="mt-2 text-2xl">
          Retención por cohorte
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Seguimiento agregado por mes de primera inscripción activa; no muestra
          datos personales.
        </p>
        {!cohorts ? (
          <p
            role="status"
            className="mt-5 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          >
            No se pudo actualizar este resumen. El resto del panel sigue
            disponible.
          </p>
        ) : (
          <>
            <p className="mt-4 border-l-2 border-amber-500 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              {cohorts.pauseGrace.reason} La fecha de cohorte usa el primer
              estado activo registrado; si falta historial, usa el inicio de la
              inscripción.
            </p>
            {cohorts.projection.status !== "ready" ? (
              <p
                className="mt-4 border border-slate-300 bg-white p-4 text-sm text-slate-600"
                role="status"
              >
                {cohorts.projection.reason ??
                  "El resumen de cohortes todavía no está disponible."}
              </p>
            ) : cohorts.items.length === 0 ? (
              <p className="mt-4 border border-slate-300 bg-white p-4 text-sm text-slate-600">
                Aún no hay cohortes con historial de inscripción en este ámbito.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto border border-slate-300 bg-white">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Retención agregada por mes de primera inscripción activa
                  </caption>
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-3" scope="col">
                        Cohorte
                      </th>
                      <th className="px-3 py-3 text-right" scope="col">
                        Tamaño
                      </th>
                      <th className="px-3 py-3" scope="col">
                        Último período
                      </th>
                      <th className="px-3 py-3 text-right" scope="col">
                        Retención
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {cohorts.items.map((item) => {
                      const latest = item.matrix.at(-1);
                      const rate = latest?.retentionRate;
                      const periodEnd =
                        typeof latest?.periodEnd === "string"
                          ? latest.periodEnd
                          : null;
                      const retentionRate =
                        typeof rate === "number" ? rate : null;
                      return (
                        <tr key={item.cohortMonth}>
                          <th className="px-3 py-3 font-semibold" scope="row">
                            {formatMonth(item.cohortMonth).replace(
                              /^./,
                              (letter) => letter.toLocaleUpperCase("es-ES")
                            )}
                          </th>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">
                            {item.cohortSize}
                          </td>
                          <td className="px-3 py-3">
                            {periodEnd ? formatDate(periodEnd) : "—"}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">
                            {retentionRate === null
                              ? "No disponible"
                              : new Intl.NumberFormat("es-ES", {
                                  style: "percent",
                                  maximumFractionDigits: 1,
                                }).format(retentionRate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </article>
    </section>
  );
}

function EmptyDashboard({
  bundle,
  operationalSummary,
}: {
  bundle: OwnerDashboardBundle;
  operationalSummary?:
    | import("@/modules/owner-dashboard/application/operational-summary").OwnerOperationalSummary
    | null;
}) {
  return (
    <main id="contenido" className="mx-auto max-w-5xl px-5 py-10">
      {operationalSummary !== undefined && (
        <OwnerOperationalSummaryPanel summary={operationalSummary} />
      )}
      <section
        id="data-status"
        className="mt-6 w-full border-l-4 border-teal-700 bg-white p-7 shadow-soft sm:p-10"
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-800">
          Primer cierre
        </p>
        <h1 className="mt-3 text-3xl text-slate-950">
          {operationalSummary
            ? "Tu Health Score todavía está esperando métricas"
            : "Tu panel todavía está esperando datos"}
        </h1>
        <p className="mt-4 max-w-xl text-slate-600">
          {bundle.priorities[0]?.detail ??
            "Completa las operaciones del período y calcula las métricas."}
        </p>
        <PipelineFreshnessNotice freshness={bundle.freshness} />
        <Link
          href={bundle.priorities[0]?.href ?? "/owner#data-status"}
          className="touch-target mt-7 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white"
        >
          {bundle.priorities[0]?.key.startsWith("insight-")
            ? "Revisar prioridad"
            : bundle.priorities[0]?.key === "score-targets-setup"
              ? "Configurar objetivos"
              : "Revisar estado de datos"}{" "}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href={`/owner/groups?organizationId=${bundle.organization.id}`}
          className="touch-target ml-3 mt-7 inline-flex items-center gap-2 rounded-full border border-slate-400 bg-white px-5 py-3 text-sm font-bold text-slate-900"
        >
          Gestionar grupos
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href={`/owner/classes?organizationId=${bundle.organization.id}`}
          className="touch-target ml-3 mt-7 inline-flex items-center gap-2 rounded-full border border-slate-400 bg-white px-5 py-3 text-sm font-bold text-slate-900"
        >
          Gestionar clases
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href={"/owner/enrollments?organizationId=" + bundle.organization.id}
          className="touch-target ml-3 mt-7 inline-flex items-center gap-2 rounded-full border border-slate-400 bg-white px-5 py-3 text-sm font-bold text-slate-900"
        >
          Gestionar inscripciones
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}

function PipelineFreshnessNotice({
  freshness,
}: {
  freshness: OwnerDashboardBundle["freshness"];
}) {
  if (freshness.status === "current") return null;
  const role = freshness.status === "failed" ? "alert" : "status";
  const ageMinutes =
    freshness.oldestUnsettledAgeSeconds === null
      ? null
      : Math.ceil(freshness.oldestUnsettledAgeSeconds / 60);
  const unsettledCount =
    freshness.pendingEventCount + freshness.processingEventCount;
  const className =
    freshness.status === "failed" || freshness.status === "stale"
      ? "border-amber-400 bg-amber-50 text-amber-950"
      : "border-sky-300 bg-sky-50 text-sky-950";
  return (
    <div role={role} className={`mt-4 border p-4 text-sm ${className}`}>
      {freshness.status === "failed" ? (
        <>
          <strong>Hay cambios operativos fallidos.</strong> El último cálculo
          válido se conserva. Incidencias fallidas: {freshness.failedEventCount}
          .
        </>
      ) : freshness.status === "stale" ? (
        <>
          <strong>Hay cambios operativos atrasados.</strong> La cola más antigua
          lleva {ageMinutes ?? "—"} min; se supera el objetivo de{" "}
          {Math.round(freshness.slaSeconds / 60)} min. El panel conserva el
          último cálculo válido.
        </>
      ) : (
        <>
          <strong>Hay cambios esperando actualización.</strong> En cola o en
          proceso: {unsettledCount}.
          {ageMinutes !== null ? ` Antigüedad máxima: ${ageMinutes} min.` : ""}
        </>
      )}
    </div>
  );
}

export function OwnerDashboardView({
  bundle,
  capacity = null,
  cohorts = null,
  dashboardFilters,
  dashboardLayout,
  preview = false,
  operationalSummary,
}: {
  bundle: OwnerDashboardBundle;
  capacity?: CapacityBundle | null;
  cohorts?: CohortsBundle | null;
  dashboardFilters?: DashboardFilters;
  dashboardLayout?: OwnerDashboardLayout;
  preview?: boolean;
  operationalSummary?:
    | import("@/modules/owner-dashboard/application/operational-summary").OwnerOperationalSummary
    | null;
}) {
  if (bundle.state === "empty") {
    return (
      <div className="min-h-screen bg-[#F1F3EF] text-slate-950">
        <EmptyDashboard
          bundle={bundle}
          operationalSummary={operationalSummary}
        />
        <div className="mx-auto max-w-3xl px-5 pb-16">
          <OperationalEvidence capacity={capacity} cohorts={cohorts} />
        </div>
      </div>
    );
  }

  const metricByKey = new Map(
    bundle.metrics.map((metric) => [metric.key, metric])
  );
  const headlineMetrics = [
    { key: "net_collected_minor", label: "Cobrado neto", icon: Banknote },
    {
      key: "active_athletes_count",
      label: "Atletas activos",
      icon: UsersRound,
    },
    { key: "cohort_retention_rate", label: "Retención", icon: Sparkles },
    { key: "class_fill_rate", label: "Ocupación", icon: Gauge },
  ];
  const maxTrend = Math.max(
    ...bundle.scoreTrend.map((point) => point.score ?? 0),
    100
  );

  return (
    <div className="min-h-screen bg-[#F1F3EF] text-slate-950">
      <main
        id="contenido"
        className="mx-auto max-w-[92rem] px-5 pb-28 pt-6 lg:px-10 lg:pb-16 lg:pt-10"
      >
        <section
          aria-labelledby="dashboard-title"
          className="border-b border-slate-300 pb-7"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
                Cierre de dirección
              </p>
              <h1
                id="dashboard-title"
                className="mt-2 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl"
              >
                {bundle.organization.name}
              </h1>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  {bundle.period
                    ? `${formatDate(bundle.period.start)} — ${formatDate(bundle.period.end)}`
                    : "Sin período"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                  Actualizado{" "}
                  {bundle.score
                    ? formatTimestamp(bundle.score.sourceWatermark)
                    : "—"}
                </span>
              </div>
            </div>
            <form
              method="get"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end"
              aria-label="Filtros del dashboard"
            >
              <input
                type="hidden"
                name="organizationId"
                value={bundle.organization.id}
              />
              <label
                className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-600"
                htmlFor="from"
              >
                Desde
                <input
                  id="from"
                  name="from"
                  type="date"
                  defaultValue={bundle.period?.start}
                  className="touch-target rounded-none border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-950"
                />
              </label>
              <label
                className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-600"
                htmlFor="to"
              >
                Hasta
                <input
                  id="to"
                  name="to"
                  type="date"
                  defaultValue={bundle.period?.end}
                  className="touch-target rounded-none border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-950"
                />
              </label>
              <label
                className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-600"
                htmlFor="locationId"
              >
                Ámbito
                <select
                  id="locationId"
                  name="locationId"
                  defaultValue={bundle.scope.locationId ?? ""}
                  className="touch-target min-w-56 rounded-none border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-950"
                >
                  {bundle.scope.canViewOrganizationAggregate && (
                    <option value="">Toda la academia</option>
                  )}
                  {bundle.scope.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              {dashboardFilters && (
                <>
                  <label
                    className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-600"
                    htmlFor="programId"
                  >
                    Programa
                    <select
                      id="programId"
                      name="programId"
                      defaultValue={dashboardFilters.selectedProgramId ?? ""}
                      className="touch-target min-w-40 rounded-none border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-950"
                    >
                      <option value="">Todos</option>
                      {dashboardFilters.programs.map((program) => (
                        <option key={program.id} value={program.id}>
                          {program.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-600"
                    htmlFor="groupId"
                  >
                    Grupo
                    <select
                      id="groupId"
                      name="groupId"
                      defaultValue={dashboardFilters.selectedGroupId ?? ""}
                      className="touch-target min-w-40 rounded-none border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-950"
                    >
                      <option value="">Todos</option>
                      {dashboardFilters.groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <button className="touch-target rounded-none bg-slate-950 px-5 text-sm font-bold text-white hover:bg-teal-900">
                Aplicar
              </button>
              {dashboardFilters && (
                <p className="text-xs leading-5 text-slate-600 sm:col-span-2 lg:col-span-3">
                  Programa y grupo acotan aforo y cohortes; el Health Score se
                  mantiene en el ámbito academia/sede.
                </p>
              )}
            </form>
          </div>
        </section>

        {operationalSummary !== undefined && (
          <OwnerOperationalSummaryPanel summary={operationalSummary} />
        )}

        {bundle.state === "stale" && bundle.freshness.status === "current" && (
          <div
            role="status"
            id="data-status"
            className="mt-5 flex gap-3 border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"
          >
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <strong>Datos atrasados.</strong> El panel conserva el último
              cálculo válido y muestra su fecha; no lo presenta como actual.
            </div>
          </div>
        )}

        {bundle.state !== "stale" && (
          <p id="data-status" className="mt-5 text-sm text-slate-600">
            Estado de datos:{" "}
            <strong className="text-slate-950">
              {bundle.state === "insufficient"
                ? "cobertura insuficiente"
                : "actualizado"}
            </strong>
            .
          </p>
        )}

        <PipelineFreshnessNotice freshness={bundle.freshness} />

        <section
          aria-labelledby="priority-title"
          className="mt-7 lg:grid lg:grid-cols-[0.9fr_2.1fr] lg:gap-8"
        >
          <div className="order-1 border-t-4 border-zaltyko-coral bg-[#FFF8F2] p-5 lg:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#A33A2D]">
              Primero hoy
            </p>
            <h2
              id="priority-title"
              className="mt-2 text-2xl tracking-[-0.03em]"
            >
              Decisiones antes que gráficos
            </h2>
            <ol className="mt-5 space-y-3">
              {bundle.priorities.map((priority, index) => (
                <li key={priority.key}>
                  <Link
                    href={priority.href}
                    className="group flex min-h-16 items-start gap-3 border-t border-slate-300 py-3 focus-visible:bg-white"
                  >
                    <span className="mt-0.5 font-mono text-xs font-bold text-slate-600">
                      0{index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm text-slate-950">
                        {priority.title}
                      </strong>
                      <span className="mt-1 block text-sm leading-5 text-slate-600">
                        {priority.detail}
                      </span>
                    </span>
                    <ChevronRight
                      className="mt-2 h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ol>
            <Link
              href="/owner/insights"
              className="touch-target mt-5 inline-flex w-full items-center justify-center gap-2 bg-teal-800 px-5 py-3 text-sm font-bold text-white hover:bg-teal-900"
            >
              Abrir bandeja de insights{" "}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div
            id="score"
            className="order-2 mt-7 border-t border-slate-400 pt-6 lg:mt-0 lg:grid lg:grid-cols-[19rem_1fr] lg:gap-8 lg:pt-0"
          >
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                Academy Health Score
              </p>
              <ScoreDial
                value={bundle.score?.value ?? null}
                status={bundle.score?.status ?? "insufficient_data"}
              />
              <p className="text-sm text-slate-600">
                Cobertura{" "}
                <strong className="text-slate-950">
                  {Math.round((bundle.score?.coverage ?? 0) * 100)}%
                </strong>
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {bundle.scoreComparison ? (
                  <>
                    Vs. período comparable hasta{" "}
                    {formatDate(bundle.scoreComparison.previousPeriod.end)}:{" "}
                    <strong className="text-slate-950">
                      {bundle.scoreComparison.delta > 0 ? "+" : ""}
                      {bundle.scoreComparison.delta.toFixed(1)} puntos
                    </strong>
                  </>
                ) : bundle.score?.status === "insufficient_data" ? (
                  "Comparación no disponible: datos insuficientes"
                ) : (
                  "Sin período anterior comparable con el mismo perfil"
                )}
              </p>
              <Link
                href="#explain-title"
                className="touch-target mt-3 inline-flex items-center gap-2 text-sm font-bold text-teal-800 underline decoration-teal-300 underline-offset-4"
              >
                Ver qué lo explica{" "}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              {bundle.scope.canManageHealthScore && (
                <Link
                  href={`/owner/health-score/setup?organizationId=${bundle.organization.id}`}
                  className="touch-target mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-700 underline underline-offset-4"
                >
                  Editar metas del score
                </Link>
              )}
            </div>
            <div className="mt-6 lg:mt-0">
              <div className="flex items-end justify-between border-b border-slate-400 pb-3">
                <h2 className="text-2xl tracking-[-0.03em]">
                  De qué está hecho
                </h2>
                <span className="text-xs text-slate-600">Versión trazable</span>
              </div>
              <div className="divide-y divide-slate-300">
                {bundle.dimensions.map((dimension) => (
                  <div
                    id={`dimension-${dimension.key}`}
                    key={dimension.key}
                    className="grid grid-cols-[1fr_auto] gap-4 py-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        {dimension.status === "insufficient_data" ? (
                          <CircleAlert
                            className="h-4 w-4 text-slate-600"
                            aria-hidden="true"
                          />
                        ) : (
                          <CheckCircle2
                            className="h-4 w-4 text-teal-700"
                            aria-hidden="true"
                          />
                        )}
                        <h3 className="font-display text-base font-semibold">
                          {dimension.label}
                        </h3>
                      </div>
                      <div
                        className="mt-2 h-1.5 overflow-hidden bg-slate-300"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full bg-teal-700"
                          style={{ width: `${dimension.score ?? 0}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        {statusLabels[dimension.status] ?? dimension.status} ·
                        cobertura {Math.round(dimension.coverage * 100)}%
                      </p>
                    </div>
                    <span className="self-center font-mono text-2xl font-semibold tabular-nums">
                      {dimension.score === null
                        ? "—"
                        : Math.round(dimension.score)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <DashboardModuleLayout
          key={`${bundle.organization.id}:${dashboardLayout?.version ?? 0}:${dashboardLayout?.order.join(",") ?? "default"}`}
          organizationId={bundle.organization.id}
          initialOrder={dashboardLayout?.order ?? DEFAULT_OWNER_DASHBOARD_ORDER}
          initialVersion={dashboardLayout?.version ?? 0}
          enabled={!preview}
        >
          <DashboardModule moduleId="kpis" title="Indicadores clave">
            <section
              aria-labelledby="kpi-title"
              className="mt-10 border-y border-slate-400"
            >
              <h2 id="kpi-title" className="sr-only">
                Indicadores principales
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4">
                {headlineMetrics.map(({ key, label, icon: Icon }, index) => {
                  const metric = metricByKey.get(key);
                  return (
                    <article
                      id={`kpi-${key}`}
                      key={key}
                      className={`min-h-36 p-5 lg:p-7 ${index % 2 ? "border-l border-slate-300" : ""} ${index > 1 ? "border-t border-slate-300 lg:border-t-0" : ""} ${index > 0 ? "lg:border-l" : ""}`}
                    >
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-xs font-bold uppercase tracking-[0.12em]">
                          {label}
                        </span>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <p className="mt-5 font-mono text-3xl font-semibold tracking-[-0.05em] tabular-nums sm:text-4xl">
                        {formatMetric(metric)}
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        {statusLabels[metric?.quality ?? "insufficient"] ??
                          metric?.quality}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>
          </DashboardModule>

          <DashboardModule moduleId="trends" title="Tendencias y cobros">
            <section className="mt-10 grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
              <article
                aria-labelledby="trend-title"
                className="bg-slate-950 p-6 text-white sm:p-8"
              >
                <div className="flex items-baseline justify-between">
                  <h2 id="trend-title" className="text-2xl">
                    Tendencia del score
                  </h2>
                  <span className="text-xs text-slate-400">
                    Últimos cierres
                  </span>
                </div>
                <div
                  className="mt-8 flex h-48 items-end gap-4"
                  role="img"
                  aria-label={`Tendencia: ${bundle.scoreTrend.map((point) => `${point.periodEnd}, ${point.score ?? "sin datos"}`).join("; ")}`}
                >
                  {bundle.scoreTrend.map((point) => (
                    <div
                      key={point.periodEnd}
                      className="flex h-full flex-1 flex-col justify-end gap-2"
                    >
                      <span className="text-center font-mono text-xs text-slate-300">
                        {point.score === null ? "—" : Math.round(point.score)}
                      </span>
                      <div
                        className="w-full bg-teal-400"
                        style={{
                          height: `${((point.score ?? 0) / maxTrend) * 100}%`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-center text-[10px] text-slate-400">
                        {point.periodEnd.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
                <details className="mt-6 border-t border-slate-700 pt-4 text-sm">
                  <summary className="touch-target cursor-pointer py-2 font-semibold text-slate-200">
                    Ver datos en tabla
                  </summary>
                  <div className="overflow-x-auto">
                    <table className="mt-3 w-full border-collapse text-left text-xs">
                      <caption className="sr-only">
                        Tendencia histórica del Academy Health Score
                      </caption>
                      <thead className="text-slate-400">
                        <tr>
                          <th className="py-2 pr-3" scope="col">
                            Fin del período
                          </th>
                          <th className="py-2 pr-3" scope="col">
                            Score
                          </th>
                          <th className="py-2" scope="col">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {bundle.scoreTrend.map((point) => (
                          <tr key={point.periodEnd}>
                            <th className="py-2 pr-3 font-normal" scope="row">
                              {point.periodEnd}
                            </th>
                            <td className="py-2 pr-3">
                              {point.score ?? "Sin datos"}
                            </td>
                            <td className="py-2">
                              {statusLabels[point.status] ?? point.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </article>

              <article
                aria-labelledby="money-title"
                className="border border-slate-400 bg-white p-6 sm:p-8"
              >
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
                  Flujo de cobro
                </p>
                <h2 id="money-title" className="mt-2 text-2xl">
                  De lo esperado a lo cobrado
                </h2>
                <dl className="mt-7 space-y-4">
                  {[
                    ["Esperado", "recognized_revenue_minor"],
                    ["Cobrado neto", "net_collected_minor"],
                    ["Pendiente", "outstanding_minor"],
                  ].map(([label, key]) => (
                    <div
                      key={key}
                      className="flex items-baseline justify-between border-b border-slate-200 pb-3"
                    >
                      <dt className="text-sm text-slate-600">{label}</dt>
                      <dd className="font-mono text-xl font-semibold tabular-nums">
                        {formatMetric(metricByKey.get(key))}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 text-sm leading-6 text-slate-600">
                  Los reembolsos reducen lo cobrado neto; no reescriben
                  silenciosamente la obligación original.
                </p>
              </article>
            </section>
          </DashboardModule>

          <DashboardModule
            moduleId="explanation"
            title="Detalle de indicadores"
          >
            <section
              aria-labelledby="explain-title"
              className="mt-12 border-t border-slate-400 pt-7"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                    Auditable
                  </p>
                  <h2 id="explain-title" className="mt-2 text-2xl">
                    Explica cualquier cifra
                  </h2>
                </div>
                <p className="text-sm text-slate-600">
                  {bundle.score?.benchmarkName} ·{" "}
                  {bundle.score?.benchmarkSource}
                </p>
              </div>
              <div className="mt-6 divide-y divide-slate-300 border-y border-slate-300">
                {bundle.metrics
                  .filter(
                    (metric) =>
                      metric.normalizedScore !== null ||
                      metric.quality !== "complete"
                  )
                  .map((metric) => (
                    <details
                      id={`metric-${metric.key}`}
                      key={metric.key}
                      className="group"
                    >
                      <summary className="touch-target flex cursor-pointer list-none items-center gap-4 py-4 font-semibold marker:hidden">
                        <span className="min-w-0 flex-1">{metric.name}</span>
                        <span className="font-mono text-sm tabular-nums">
                          {formatMetric(metric)}
                        </span>
                        <ChevronRight
                          className="h-4 w-4 transition-transform group-open:rotate-90"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="grid gap-4 pb-5 text-sm text-slate-600 sm:grid-cols-4">
                        <div>
                          <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                            Numerador
                          </span>
                          <span className="mt-1 block font-mono text-slate-950">
                            {metric.numerator ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                            Denominador
                          </span>
                          <span className="mt-1 block font-mono text-slate-950">
                            {metric.denominator ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                            Objetivo
                          </span>
                          <span className="mt-1 block font-mono text-slate-950">
                            {metric.target ?? "Sin objetivo"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                            Calidad
                          </span>
                          <span className="mt-1 block text-slate-950">
                            {statusLabels[metric.quality] ?? metric.quality} · v
                            {metric.formulaVersion}
                          </span>
                        </div>
                      </div>
                    </details>
                  ))}
              </div>
            </section>
          </DashboardModule>

          <DashboardModule moduleId="operations" title="Capacidad y cohortes">
            <OperationalEvidence capacity={capacity} cohorts={cohorts} />
          </DashboardModule>
        </DashboardModuleLayout>

        <footer className="mt-10 flex flex-col gap-3 border-t border-slate-300 pt-5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Último watermark:{" "}
            {bundle.score ? formatTimestamp(bundle.score.sourceWatermark) : "—"}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {bundle.scope.locationId
              ? bundle.scope.locations.find(
                  (item) => item.id === bundle.scope.locationId
                )?.name
              : "Toda la academia"}
          </span>
        </footer>
      </main>
    </div>
  );
}
