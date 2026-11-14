"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  MonthlyFeesChart as MonthlyFeesChartModel,
  MonthlyFeesCurrency,
} from "@/modules/owner-dashboard/domain/summary-charts-model";
import { ownerUi } from "../owner-ui";
import { delayStyle, useEnteredView, useRisingNumber } from "./use-chart-motion";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

// Cobrado en tapiz; por vencer en ocre (aviso, aún no es deuda); vencido en
// señal (deuda). The Señal Rule y The Aviso Rule de DESIGN.md.
const SEGMENTS = [
  { key: "collected", label: "Cobrado", swatch: "bg-mat" },
  { key: "pending", label: "Por vencer", swatch: "bg-ochre" },
  { key: "overdue", label: "Vencido sin cobrar", swatch: "bg-signal" },
] as const;

function amountOf(row: MonthlyFeesCurrency, key: (typeof SEGMENTS)[number]["key"]) {
  return key === "collected" ? row.collectedCents : key === "pending" ? row.pendingCents : row.overdueCents;
}

function CurrencyFees({
  row,
  entered,
  primary,
}: {
  row: MonthlyFeesCurrency;
  entered: boolean;
  primary: boolean;
}) {
  const collected = useRisingNumber(row.collectedCents, entered, 800);
  let offset = 0;
  return (
    <div className="grid gap-4">
      <div>
        <p
          className={cn(
            "font-display font-black leading-none tabular-nums text-mat-night",
            primary ? "text-4xl sm:text-5xl" : "text-3xl"
          )}
        >
          <span aria-hidden="true">{money(Math.round(collected), row.currency)}</span>
          <span className="sr-only">{money(row.collectedCents, row.currency)}</span>
        </p>
        <p className="mt-1.5 text-sm text-z-soft">
          cobrado de {money(row.billedCents, row.currency)} · {row.collectedPercent} %
        </p>
      </div>

      <div
        role="img"
        aria-label={`Cuotas en ${row.currency}: ${SEGMENTS.map((segment) => `${segment.label.toLowerCase()} ${money(amountOf(row, segment.key), row.currency)}`).join(", ")}.`}
        className="relative flex h-4 overflow-hidden rounded-sm bg-chalk-dust"
      >
        {SEGMENTS.map((segment, index) => {
          const share = row.shares[segment.key];
          const left = offset;
          offset += share;
          return share > 0 ? (
            <span
              key={segment.key}
              aria-hidden="true"
              className={cn(
                "absolute inset-y-0 border-r-2 border-white last:border-r-0",
                segment.swatch,
                entered ? "zk-bar-grow" : "zk-bar-wait"
              )}
              style={delayStyle(`${index * 180}ms`, {
                left: `${left * 100}%`,
                width: `${share * 100}%`,
              })}
            />
          ) : null;
        })}
      </div>

      <dl className="grid gap-0 border-t border-z-line">
        {SEGMENTS.map((segment) => (
          <div
            key={segment.key}
            className="flex items-center justify-between gap-3 border-b border-z-line py-2 text-sm"
          >
            <dt className="flex items-center gap-2 text-z-soft">
              <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-sm", segment.swatch)} />
              {segment.label}
            </dt>
            <dd
              className={cn(
                "font-semibold tabular-nums",
                segment.key === "overdue" && row.overdueCents > 0 ? "text-signal-ink" : "text-z-ink"
              )}
            >
              {money(amountOf(row, segment.key), row.currency)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Cuotas del mes: lo cobrado sube como un contador y la barra se reparte en
 * cobrado, por vencer y vencido. Una sección por moneda.
 */
export function MonthlyFeesChart({
  chart,
  registerPaymentHref,
}: {
  chart: MonthlyFeesChartModel;
  /** Enlace a «Registrar un pago» (no se muestra en la propia pantalla de cobros). */
  registerPaymentHref?: string | null;
}) {
  const [ref, entered] = useEnteredView<HTMLDivElement>();
  const charges = chart.currencies.reduce((sum, row) => sum + row.charges, 0);
  const outstanding = chart.currencies.some((row) => row.pendingCents + row.overdueCents > 0);
  return (
    <div ref={ref} className="flex min-w-0 flex-1 flex-col gap-6">
      {chart.currencies.map((row, index) => (
        <CurrencyFees key={row.currency} row={row} entered={entered} primary={index === 0} />
      ))}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-z-soft">
          {charges} {charges === 1 ? "cuota" : "cuotas"} con periodo en {chart.monthName}. Cobrado es lo
          que ya está asignado a esas cuotas.
        </p>
        {registerPaymentHref && outstanding ? (
          <Link href={registerPaymentHref} className={cn(ownerUi.textLink, "group inline-flex min-h-11 items-center gap-1")}>
            Registrar un pago
            <ArrowRight
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
