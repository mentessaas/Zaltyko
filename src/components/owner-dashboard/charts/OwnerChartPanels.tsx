import {
  athleteSignupsEmptyCopy,
  attendanceEmptyCopy,
  monthlyFeesEmptyCopy,
  occupancyEmptyCopy,
  type AthleteSignupsChart,
  type AttendanceWeeksChart,
  type ClassOccupancyChart,
  type MonthlyFeesChart,
  type SummaryChartActionTarget,
} from "@/modules/owner-dashboard/domain/summary-charts-model";
import type { OwnerSummaryCharts as OwnerSummaryChartsData } from "@/modules/owner-dashboard/application/summary-charts";
import { ownerUi } from "../owner-ui";
import { OwnerChartEmpty, OwnerChartEmptyAxis, OwnerChartPanel } from "./chart-parts";
import {
  LazyAthleteSignupsChart,
  LazyAttendanceWeeksChart,
  LazyClassOccupancyChart,
  LazyMonthlyFeesChart,
} from "./owner-charts-lazy";

/**
 * Paneles de gráficas de `/owner`. El servidor decide si hay datos: sin ellos
 * pinta el estado vacío (sin JavaScript de gráficas); con ellos monta la
 * gráfica en carga diferida.
 */

export type OwnerChartLinks = Partial<Record<SummaryChartActionTarget, string>>;

type HeadingLevel = "h2" | "h3";

export function OwnerAttendanceWeeksPanel({
  chart,
  links,
  headingLevel,
  className,
}: {
  chart: AttendanceWeeksChart;
  links: OwnerChartLinks;
  headingLevel?: HeadingLevel;
  className?: string;
}) {
  const copy = attendanceEmptyCopy();
  return (
    <OwnerChartPanel
      id="owner-chart-attendance"
      title="Asistencia por semana"
      caption="Marcas de las últimas 8 semanas, contadas por la fecha de cada sesión."
      headingLevel={headingLevel}
      className={className}
    >
      {chart.state === "ready" ? (
        <LazyAttendanceWeeksChart chart={chart} />
      ) : (
        <OwnerChartEmpty
          copy={copy}
          href={copy.action ? links[copy.action.target] : null}
          preview={<OwnerChartEmptyAxis labels={chart.weeks.map((week) => week.label)} />}
        />
      )}
    </OwnerChartPanel>
  );
}

export function OwnerClassOccupancyPanel({
  chart,
  links,
  headingLevel,
  className,
}: {
  chart: ClassOccupancyChart;
  links: OwnerChartLinks;
  headingLevel?: HeadingLevel;
  className?: string;
}) {
  const copy = occupancyEmptyCopy(chart);
  return (
    <OwnerChartPanel
      id="owner-chart-occupancy"
      title="Ocupación por clase"
      caption="Gimnastas inscritas hoy frente a las plazas de cada clase activa."
      headingLevel={headingLevel}
      className={className}
    >
      {chart.state === "ready" ? (
        <LazyClassOccupancyChart chart={chart} />
      ) : (
        <OwnerChartEmpty copy={copy} href={copy.action ? links[copy.action.target] : null} />
      )}
    </OwnerChartPanel>
  );
}

export function OwnerMonthlyFeesPanel({
  chart,
  links,
  registerPaymentHref,
  headingLevel,
  className,
}: {
  chart: MonthlyFeesChart;
  links: OwnerChartLinks;
  registerPaymentHref?: string | null;
  headingLevel?: HeadingLevel;
  className?: string;
}) {
  if (chart.state === "unavailable") return null;
  const copy = monthlyFeesEmptyCopy(chart);
  return (
    <OwnerChartPanel
      id="owner-chart-fees"
      title={`Cuotas de ${chart.monthName}`}
      caption="Cobrado, por vencer y vencido de las cuotas emitidas para este mes."
      headingLevel={headingLevel}
      className={className}
    >
      {chart.state === "ready" ? (
        <LazyMonthlyFeesChart chart={chart} registerPaymentHref={registerPaymentHref ?? null} />
      ) : (
        <OwnerChartEmpty
          copy={copy}
          href={copy.action ? links[copy.action.target] : null}
          preview={
            <span aria-hidden="true" className="block h-4 rounded-sm border border-dashed border-ramp-300" />
          }
        />
      )}
    </OwnerChartPanel>
  );
}

export function OwnerAthleteSignupsPanel({
  chart,
  links,
  canManageAthletes,
  headingLevel,
  className,
}: {
  chart: AthleteSignupsChart;
  links: OwnerChartLinks;
  canManageAthletes: boolean;
  headingLevel?: HeadingLevel;
  className?: string;
}) {
  const copy = athleteSignupsEmptyCopy(canManageAthletes);
  return (
    <OwnerChartPanel
      id="owner-chart-signups"
      title="Altas de gimnastas"
      caption="Fichas creadas cada mes en los últimos 6 meses."
      headingLevel={headingLevel}
      className={className}
    >
      {chart.state === "ready" ? (
        <LazyAthleteSignupsChart chart={chart} />
      ) : (
        <OwnerChartEmpty
          copy={copy}
          href={copy.action ? links[copy.action.target] : null}
          preview={<OwnerChartEmptyAxis labels={chart.months.map((month) => month.label)} />}
        />
      )}
    </OwnerChartPanel>
  );
}

/** «Cómo va la academia» en el Resumen: cuatro gráficas sobre datos reales. */
export function OwnerSummaryCharts({
  charts,
  links,
  registerPaymentHref,
  canManageAthletes,
}: {
  charts: OwnerSummaryChartsData | null;
  links: OwnerChartLinks;
  registerPaymentHref?: string | null;
  canManageAthletes: boolean;
}) {
  return (
    <section aria-labelledby="owner-summary-charts-title" className="mt-9 min-w-0">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="owner-summary-charts-title" className={ownerUi.sectionTitle}>
          Cómo va la academia
        </h2>
        <p className="text-xs text-z-soft">
          Datos registrados en Zaltyko. Pasa el ratón o toca una barra para ver el detalle.
        </p>
      </div>
      {charts ? (
        <div className="mt-4 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <OwnerAttendanceWeeksPanel chart={charts.attendance} links={links} />
          {charts.fees.state !== "unavailable" ? (
            <OwnerMonthlyFeesPanel chart={charts.fees} links={links} registerPaymentHref={registerPaymentHref} />
          ) : (
            <OwnerAthleteSignupsPanel chart={charts.signups} links={links} canManageAthletes={canManageAthletes} />
          )}
          <OwnerClassOccupancyPanel chart={charts.occupancy} links={links} />
          {charts.fees.state !== "unavailable" ? (
            <OwnerAthleteSignupsPanel chart={charts.signups} links={links} canManageAthletes={canManageAthletes} />
          ) : null}
        </div>
      ) : (
        <div role="status" className={`mt-4 ${ownerUi.noticeWarning}`}>
          No pudimos cargar las gráficas. No significa que no haya datos: vuelve a cargar la página en
          unos minutos.
        </div>
      )}
    </section>
  );
}
