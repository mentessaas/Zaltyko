"use client";

import { ChalkTally } from "@/components/mat/ChalkTally";
import { cn } from "@/lib/utils";
import {
  formatPercent,
  type ClassOccupancyChart as ClassOccupancyChartModel,
  type ClassOccupancyItem,
} from "@/modules/owner-dashboard/domain/summary-charts-model";
import { ownerTone } from "../owner-ui";
import { delayStyle, staggerDelay, useEnteredView, useRisingNumber } from "./use-chart-motion";

/** Más de 40 clases ya no se cuentan en palotes: solo en cifra. */
const TALLY_LIMIT = 40;

const METER: Record<ClassOccupancyItem["status"], string> = {
  open: "bg-mat",
  full: "bg-mat-deep",
  over: "bg-ochre",
};

function seatsText(item: ClassOccupancyItem): string {
  if (item.status === "over") {
    const extra = item.enrolled - item.capacity;
    return `${extra} por encima de las plazas`;
  }
  if (item.status === "full") return "Completa";
  return `${item.openSeats} ${item.openSeats === 1 ? "plaza libre" : "plazas libres"}`;
}

/**
 * Ocupación de cada clase activa: lista reglada con una barra por clase que
 * crece hasta su ocupación. Las clases completas se cuentan arriba en palotes
 * de magnesio, uno por clase completa.
 */
export function ClassOccupancyChart({ chart }: { chart: ClassOccupancyChartModel }) {
  const [ref, entered] = useEnteredView<HTMLDivElement>();
  const fill = useRisingNumber(Math.round((chart.fillRate ?? 0) * 100), entered);
  const { totals } = chart;

  return (
    <div ref={ref} className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="font-display text-5xl font-black leading-none tabular-nums text-mat-night">
            <span aria-hidden="true">{Math.round(fill)} %</span>
            <span className="sr-only">{formatPercent(chart.fillRate)}</span>
          </p>
          <p className="mt-1.5 text-sm text-z-soft">
            {totals.enrolled.toLocaleString("es-ES")} de {totals.capacity.toLocaleString("es-ES")} plazas ocupadas
          </p>
        </div>
        {totals.classes <= TALLY_LIMIT ? (
          <div className="flex items-center gap-3 text-mat">
            <ChalkTally
              count={totals.full}
              max={totals.classes}
              animate={entered}
              className="h-7"
              label={`${totals.full} de ${totals.classes} clases completas`}
            />
            <span aria-hidden="true" className="text-xs font-semibold text-ramp-600">
              {totals.full} de {totals.classes} completas
            </span>
          </div>
        ) : (
          <p className="text-xs font-semibold text-ramp-600">
            {totals.full} de {totals.classes} clases completas
          </p>
        )}
      </div>

      <ul aria-label="Ocupación por clase" className="border-t-[3px] border-mat-night">
        {chart.items.map((item, index) => {
          const width = Math.min(item.fillRate, 1) * 100;
          return (
            <li
              key={item.classTemplateId}
              className="grid gap-2 border-b border-z-line px-1 py-3 transition-colors hover:bg-mat-wash"
            >
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-z-ink">{item.className}</span>
                  {chart.showLocation ? (
                    <span className="block truncate text-xs text-z-soft">{item.locationName}</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-display text-xl font-black tabular-nums text-mat-night">
                  {item.enrolled}
                  <span className="text-sm font-bold text-ramp-500">/{item.capacity}</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  role="meter"
                  aria-label={`Ocupación de ${item.className}`}
                  aria-valuemin={0}
                  aria-valuemax={item.capacity}
                  aria-valuenow={Math.min(item.enrolled, item.capacity)}
                  aria-valuetext={`${item.enrolled} de ${item.capacity} plazas. ${seatsText(item)}.`}
                  className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-chalk-dust"
                >
                  <span
                    className={cn(
                      "block h-full rounded-sm",
                      METER[item.status],
                      entered ? "zk-bar-grow" : "zk-bar-wait"
                    )}
                    style={delayStyle(staggerDelay(index, 60), { width: `${width}%` })}
                  />
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    item.status === "full"
                      ? ownerTone.chipActive
                      : item.status === "over"
                        ? ownerTone.chipWarning
                        : "font-semibold text-z-soft"
                  )}
                >
                  {seatsText(item)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {chart.hiddenCount > 0 ? (
        <p className="text-xs text-z-soft">
          Y {chart.hiddenCount} {chart.hiddenCount === 1 ? "clase más" : "clases más"} con menos ocupación.
        </p>
      ) : null}
    </div>
  );
}
