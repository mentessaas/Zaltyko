"use client";

import { cn } from "@/lib/utils";
import type { AthleteSignupsChart as AthleteSignupsChartModel } from "@/modules/owner-dashboard/domain/summary-charts-model";
import { ChartTip, ChartTipRow, tipAlign } from "./chart-parts";
import { delayStyle, staggerDelay, useEnteredView, useRisingNumber } from "./use-chart-motion";

function fichas(value: number) {
  return `${value.toLocaleString("es-ES")} ${value === 1 ? "ficha nueva" : "fichas nuevas"}`;
}

/** Altas de gimnastas de los últimos 6 meses: una columna por mes. */
export function AthleteSignupsChart({ chart }: { chart: AthleteSignupsChartModel }) {
  const [ref, entered] = useEnteredView<HTMLDivElement>();
  const total = useRisingNumber(chart.total, entered);

  return (
    <div ref={ref} className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="font-display text-5xl font-black leading-none tabular-nums text-mat-night">
            <span aria-hidden="true">{Math.round(total).toLocaleString("es-ES")}</span>
            <span className="sr-only">{chart.total.toLocaleString("es-ES")}</span>
          </p>
          <p className="mt-1.5 text-sm text-z-soft">
            {chart.total === 1 ? "ficha nueva" : "fichas nuevas"} en 6 meses
          </p>
        </div>
        <p className="text-xs font-semibold text-ramp-600">
          Este mes: {chart.currentMonth.toLocaleString("es-ES")}
        </p>
      </div>

      <ol aria-label="Altas de gimnastas por mes" className="flex h-40 items-end gap-2 border-b-[3px] border-mat-night sm:gap-3">
        {chart.months.map((month, index) => {
          const height = chart.peak > 0 ? (month.created / chart.peak) * 100 : 0;
          return (
            <li
              key={month.month}
              tabIndex={0}
              aria-label={`${month.longLabel}: ${fichas(month.created)}${month.current ? " (mes en curso)" : ""}.`}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-sm outline-none focus-visible:bg-mat-wash"
            >
              <ChartTip align={tipAlign(index, chart.months.length)}>
                <span className="block font-semibold capitalize text-mat-night">{month.longLabel}</span>
                <span className="mt-1 grid gap-0.5">
                  <ChartTipRow swatch="bg-mat-deep" label="Fichas nuevas" value={String(month.created)} />
                </span>
                {month.current ? <span className="mt-1 block text-ramp-600">Mes en curso.</span> : null}
              </ChartTip>
              <span
                aria-hidden="true"
                className={cn(
                  "mb-1 text-xs font-semibold tabular-nums",
                  month.created === 0 ? "text-ramp-400" : month.current ? "text-mat" : "text-ramp-600",
                  entered ? "zk-settle" : "opacity-0"
                )}
                style={delayStyle(`calc(${staggerDelay(index, 60)} + 320ms)`)}
              >
                {month.created}
              </span>
              {month.created > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "block w-full max-w-12 rounded-t-sm transition-[filter] duration-150 group-hover:brightness-110",
                    month.current ? "bg-mat" : "bg-mat-deep",
                    entered ? "zk-bar-rise" : "zk-bar-wait"
                  )}
                  style={delayStyle(staggerDelay(index, 60), { height: `${Math.max(height, 4)}%` })}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      <ol aria-hidden="true" className="-mt-3 flex gap-2 sm:gap-3">
        {chart.months.map((month) => (
          <li
            key={month.month}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-xs",
              month.current ? "font-semibold text-mat" : "text-z-soft"
            )}
          >
            {month.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
