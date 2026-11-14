"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatPercent,
  type AttendanceWeeksChart as AttendanceWeeksChartModel,
} from "@/modules/owner-dashboard/domain/summary-charts-model";
import { ChartLegend, ChartTip, ChartTipRow, tipAlign } from "./chart-parts";
import { delayStyle, staggerDelay, useEnteredView, useRisingNumber } from "./use-chart-motion";

const ATTENDED = "bg-mat";
const MISSED = "bg-ramp-400";

function plural(value: number, one: string, many: string) {
  return `${value.toLocaleString("es-ES")} ${value === 1 ? one : many}`;
}

/**
 * Asistencia de las últimas 8 semanas: cada columna son las marcas de una
 * semana, presencias abajo en tapiz y ausencias encima en rampa. Las columnas
 * se levantan desde la línea del suelo al entrar en pantalla.
 */
export function AttendanceWeeksChart({ chart }: { chart: AttendanceWeeksChartModel }) {
  const [ref, entered] = useEnteredView<HTMLDivElement>();
  const rate = useRisingNumber(Math.round((chart.rate ?? 0) * 100), entered);
  const delta = chart.rateDeltaPoints;
  const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div ref={ref} className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="font-display text-5xl font-black leading-none tabular-nums text-mat-night">
            <span aria-hidden="true">{Math.round(rate)} %</span>
            <span className="sr-only">{formatPercent(chart.rate)}</span>
          </p>
          <p className="mt-1.5 text-sm text-z-soft">
            de las marcas fueron presencias en 8 semanas
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-z-soft">
          <dt>Presencias</dt>
          <dd className="text-right font-semibold tabular-nums text-z-ink">
            {chart.totals.attended.toLocaleString("es-ES")}
          </dd>
          <dt>Sesiones con lista</dt>
          <dd className="text-right font-semibold tabular-nums text-z-ink">
            {chart.totals.sessions.toLocaleString("es-ES")}
          </dd>
        </dl>
      </div>

      <p className="flex items-center gap-1.5 text-xs font-semibold text-ramp-600">
        <DeltaIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {delta === null
          ? "Aún no hay cuatro semanas anteriores con lista para comparar."
          : delta === 0
            ? "Igual que en las cuatro semanas anteriores."
            : `${delta > 0 ? "+" : "−"}${plural(Math.abs(delta), "punto", "puntos")} frente a las cuatro semanas anteriores.`}
      </p>

      <ol
        aria-label="Asistencia por semana"
        className="relative flex h-48 items-end gap-1.5 border-b-[3px] border-mat-night sm:gap-2.5"
      >
        {chart.weeks.map((week, index) => {
          const height = chart.peak > 0 ? Math.max((week.records / chart.peak) * 100, 4) : 0;
          const attendedShare = week.records > 0 ? (week.attended / week.records) * 100 : 0;
          const summary =
            week.records === 0
              ? `Semana del ${week.label}: sin lista pasada.`
              : `Semana del ${week.label}: ${plural(week.attended, "presencia", "presencias")}, ${plural(week.missed, "ausencia", "ausencias")}, ${formatPercent(week.rate)} de asistencia.`;
          return (
            <li
              key={week.weekStart}
              tabIndex={0}
              aria-label={summary}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-sm outline-none focus-visible:bg-mat-wash"
            >
              <ChartTip align={tipAlign(index, chart.weeks.length)}>
                <span className="block font-semibold text-mat-night">
                  {week.current ? "Esta semana" : `Semana del ${week.label}`}
                </span>
                {week.records === 0 ? (
                  <span className="block text-ramp-600">Sin lista pasada.</span>
                ) : (
                  <span className="mt-1 grid gap-0.5">
                    <ChartTipRow swatch={ATTENDED} label="Presentes" value={String(week.present)} />
                    <ChartTipRow swatch={ATTENDED} label="Tarde" value={String(week.late)} />
                    <ChartTipRow swatch={MISSED} label="Justificadas" value={String(week.excused)} />
                    <ChartTipRow swatch={MISSED} label="Ausentes" value={String(week.absent)} />
                    <ChartTipRow label="Sesiones con lista" value={String(week.sessions)} />
                    <ChartTipRow label="Asistencia" value={formatPercent(week.rate)} />
                  </span>
                )}
              </ChartTip>
              {week.records === 0 ? (
                <span aria-hidden="true" className="mb-1 text-xs text-ramp-400">
                  —
                </span>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mb-1 text-xs font-semibold tabular-nums",
                      week.current ? "text-mat" : "text-ramp-600",
                      entered ? "zk-settle" : "opacity-0"
                    )}
                    style={delayStyle(`calc(${staggerDelay(index)} + 320ms)`)}
                  >
                    {week.attended}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex w-full max-w-12 flex-col overflow-hidden rounded-t-sm transition-[filter] duration-150 group-hover:brightness-110",
                      entered ? "zk-bar-rise" : "zk-bar-wait"
                    )}
                    style={delayStyle(staggerDelay(index), { height: `${height}%` })}
                  >
                    <span className={MISSED} style={{ height: `${100 - attendedShare}%` }} />
                    <span className={ATTENDED} style={{ height: `${attendedShare}%` }} />
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <ol aria-hidden="true" className="-mt-3 flex gap-1.5 sm:gap-2.5">
        {chart.weeks.map((week) => (
          <li
            key={week.weekStart}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-xs tabular-nums",
              week.current ? "font-semibold text-mat" : "text-z-soft"
            )}
          >
            {week.label}
          </li>
        ))}
      </ol>

      <ChartLegend
        items={[
          { swatch: ATTENDED, label: "Presentes y tarde" },
          { swatch: MISSED, label: "Ausentes y justificadas" },
        ]}
      />
    </div>
  );
}
