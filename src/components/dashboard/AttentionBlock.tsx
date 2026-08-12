/**
 * Bloque visual de una métrica del bundle de atención.
 *
 * Server Component. Cumple ZAL-619 §3.2: muestra "Sin datos" cuando la
 * fuente devolvió 0 con sourceAvailable=true; muestra un placeholder
 * distinguible cuando sourceAvailable=false (en lugar de inventar 0).
 *
 * Sin dependencias de cliente: se puede usar dentro de Server Components.
 */

import Link from "next/link";

export interface AttentionBlockProps {
  id: string;
  title: string;
  /** Valor principal; cuando `null`, la UI muestra "Sin datos" o "—". */
  value: string | number | null;
  /** Subtítulo opcional (p. ej. "3 cargos pendientes de los últimos 30 días"). */
  subtitle?: string | null;
  /** Cuando hay datos accionables, enlace al detalle. */
  href?: string | null;
  /** Estado de la fuente: si fue 0 honesto o si la query falló. */
  sourceAvailable: boolean;
  /** Slug de la fuente para que QA/auditoría la pueda trazar. */
  source: string;
  /** Etiqueta accesible del CTA, distinta del title (incluye métrica). */
  ctaLabel?: string;
  /** Tono: primary = bloque destacado (atención), secondary = informativo. */
  tone?: "primary" | "secondary";
}

const baseCardClass =
  "flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition focus-within:ring-2 focus-within:ring-sky-500 dark:border-slate-700 dark:bg-slate-900";

export function AttentionBlock({
  id,
  title,
  value,
  subtitle,
  href,
  sourceAvailable,
  source,
  ctaLabel,
  tone = "secondary",
}: AttentionBlockProps) {
  const toneClass =
    tone === "primary"
      ? "border-amber-200 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-900/10"
      : "";
  const valueClass =
    value === null
      ? "text-slate-400"
      : tone === "primary"
        ? "text-3xl font-semibold text-amber-900 dark:text-amber-100"
        : "text-3xl font-semibold text-slate-900 dark:text-slate-50";

  const display =
    value === null
      ? sourceAvailable
        ? "Sin datos"
        : "Fuente no disponible"
      : typeof value === "number"
        ? value.toLocaleString("es-ES")
        : value;

  const body = (
    <div className={`${baseCardClass} ${toneClass}`}>
      <div>
        <h3
          id={`${id}-title`}
          className="text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          {title}
        </h3>
        <p
          className={`mt-2 ${valueClass}`}
          aria-describedby={subtitle ? `${id}-subtitle` : undefined}
        >
          {display}
        </p>
        {subtitle ? (
          <p
            id={`${id}-subtitle`}
            className="mt-1 text-xs text-slate-500 dark:text-slate-400"
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        <span
          className="truncate text-slate-400 dark:text-slate-500"
          title={`Fuente: ${source}`}
        >
          Fuente: {source}
        </span>
        {href ? (
          <Link
            href={href}
            aria-label={ctaLabel ?? `Ir al detalle de ${title}`}
            className="font-medium text-sky-700 hover:underline focus:outline-none focus-visible:underline dark:text-sky-300"
          >
            Ver detalle →
          </Link>
        ) : null}
      </div>
    </div>
  );

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="h-full"
      data-source={source}
      data-source-available={sourceAvailable ? "true" : "false"}
    >
      {body}
    </section>
  );
}
