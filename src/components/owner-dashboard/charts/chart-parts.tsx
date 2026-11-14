import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { SummaryChartEmptyCopy } from "@/modules/owner-dashboard/domain/summary-charts-model";
import { ownerUi } from "../owner-ui";

/**
 * Piezas compartidas de las gráficas de `/owner`, sin hooks: valen en el
 * servidor (estados vacíos y esqueletos) y dentro de las gráficas cliente.
 */

/** Panel reglado de una gráfica: regla de 3 px en noche, título condensado. */
export function OwnerChartPanel({
  id,
  title,
  caption,
  aside,
  footer,
  headingLevel = "h3",
  className,
  children,
}: {
  id: string;
  title: string;
  caption?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  headingLevel?: "h2" | "h3";
  className?: string;
  children: ReactNode;
}) {
  const Heading = headingLevel;
  return (
    <section aria-labelledby={id} className={cn(ownerUi.card, "flex min-w-0 flex-col", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Heading id={id} className={ownerUi.cardTitle}>
            {title}
          </Heading>
          {caption ? <p className="mt-2 text-xs leading-5 text-z-soft">{caption}</p> : null}
        </div>
        {aside}
      </div>
      <div className="mt-5 flex min-w-0 flex-1 flex-col">{children}</div>
      {footer ? <div className="mt-5 border-t border-z-line pt-4">{footer}</div> : null}
    </section>
  );
}

/** Ejes vacíos: las semanas o meses reales que la gráfica irá llenando. */
export function OwnerChartEmptyAxis({ labels }: { labels: string[] }) {
  return (
    <ol aria-hidden="true" className="flex items-end gap-1.5 sm:gap-2">
      {labels.map((label) => (
        <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="h-12 w-full max-w-10 rounded-sm border border-dashed border-ramp-300" />
          <span className="text-xs tabular-nums text-z-soft">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Estado vacío didáctico: qué aparecerá aquí, qué hace falta para verlo y una
 * sola acción para conseguirlo. Nunca pinta datos de ejemplo.
 */
export function OwnerChartEmpty({
  copy,
  href,
  preview,
}: {
  copy: SummaryChartEmptyCopy;
  href?: string | null;
  preview?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-5 rounded-md border border-dashed border-ramp-300 bg-chalk p-4 sm:p-5">
      {preview}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <p className="font-semibold text-z-ink">{copy.title}</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-z-soft">{copy.body}</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-z-soft">{copy.how}</p>
        </div>
        {copy.action && href ? (
          <Link href={href} className={ownerUi.secondaryButton}>
            {copy.action.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Esqueleto de una gráfica mientras llega su código (carga diferida). */
export function OwnerChartSkeleton({
  label,
  variant,
}: {
  label: string;
  variant: "columns" | "rows" | "bar";
}) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[15rem] flex-col gap-5">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex items-end gap-3">
        <span className="h-10 w-24 rounded-sm bg-chalk-dust motion-safe:animate-pulse" />
        <span className="h-3 w-32 rounded-sm bg-chalk-dust/70 motion-safe:animate-pulse" />
      </div>
      {variant === "columns" ? (
        <div aria-hidden="true" className="flex h-40 items-end gap-2 border-b-[3px] border-chalk-dust">
          {[46, 62, 38, 70, 55, 80, 64, 50].map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-t-sm bg-chalk-dust motion-safe:animate-pulse"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      ) : variant === "rows" ? (
        <div aria-hidden="true" className="grid gap-4">
          {[72, 58, 44, 30].map((width, index) => (
            <span key={index} className="grid gap-2">
              <span className="h-3 w-1/2 rounded-sm bg-chalk-dust/70 motion-safe:animate-pulse" />
              <span className="h-2 rounded-sm bg-chalk-dust motion-safe:animate-pulse" style={{ width: `${width}%` }} />
            </span>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="grid gap-3">
          <span className="h-4 w-full rounded-sm bg-chalk-dust motion-safe:animate-pulse" />
          <span className="h-3 w-2/3 rounded-sm bg-chalk-dust/70 motion-safe:animate-pulse" />
          <span className="h-3 w-1/2 rounded-sm bg-chalk-dust/70 motion-safe:animate-pulse" />
        </div>
      )}
    </div>
  );
}

/**
 * Detalle de una barra al pasar el ratón o al enfocarla con el teclado (o
 * tocarla en el móvil). Es decorativo para el lector de pantalla: la barra ya
 * lleva su `aria-label` con los mismos datos.
 */
export function ChartTip({
  align = "center",
  children,
}: {
  align?: "start" | "center" | "end";
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-[15rem] rounded-md border border-chalk-line bg-white px-3 py-2.5 text-left text-xs leading-5 text-mat-night opacity-0 shadow-[0_6px_20px_-6px_rgba(11,20,48,0.18)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
        align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
      )}
    >
      {children}
    </div>
  );
}

/** Fila «nombre — cifra» dentro del detalle de una barra. */
export function ChartTipRow({
  swatch,
  label,
  value,
}: {
  swatch?: string;
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-ramp-600">
        {swatch ? <span className={cn("h-2 w-2 rounded-sm", swatch)} /> : null}
        {label}
      </span>
      <span className="font-semibold tabular-nums text-mat-night">{value}</span>
    </span>
  );
}

/** Leyenda: cuadrado de 8 px y nombre de la serie. */
export function ChartLegend({ items }: { items: Array<{ swatch: string; label: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-z-soft">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-sm", item.swatch)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Alineación del detalle para no salirse por los bordes. */
export function tipAlign(index: number, total: number): "start" | "center" | "end" {
  if (index <= 1) return "start";
  if (index >= total - 2) return "end";
  return "center";
}
