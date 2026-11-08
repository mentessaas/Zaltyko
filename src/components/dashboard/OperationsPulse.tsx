"use client";

import { useMemo, useState } from "react";
import { Activity, ArrowUpRight, BarChart3, Users, UserCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/dashboard";
import type { KpiTrends } from "@/lib/dashboard/kpi-trends";

type PulseMetric = "athletes" | "coaches" | "groups" | "attendance";

const METRICS: Array<{
  key: PulseMetric;
  label: string;
  icon: typeof Users;
  color: string;
  currentLabel: (value: number) => string;
}> = [
  {
    key: "athletes",
    label: "Gimnastas",
    icon: Users,
    color: "#1E3FA8",
    currentLabel: (value) => (value === 1 ? "gimnasta en la academia" : "gimnastas en la academia"),
  },
  {
    key: "coaches",
    label: "Equipo",
    icon: UserCheck,
    color: "#14307F",
    currentLabel: (value) => (value === 1 ? "persona en el equipo" : "personas en el equipo"),
  },
  {
    key: "groups",
    label: "Grupos",
    icon: BarChart3,
    color: "#3E4A66",
    currentLabel: (value) => (value === 1 ? "grupo activo" : "grupos activos"),
  },
  {
    key: "attendance",
    label: "Asistencia",
    icon: Activity,
    color: "#0B1430",
    currentLabel: () => "asistencia actual",
  },
];

function linePath(values: number[], width: number, height: number, padding = 10) {
  if (values.length < 2) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export type OperationsPulseStatus = "loading" | "ready" | "error";

interface OperationsPulseProps {
  series: KpiTrends | null;
  status: OperationsPulseStatus;
  onRetry: () => void;
}

export function OperationsPulse({ series, status, onRetry }: OperationsPulseProps) {
  const [metric, setMetric] = useState<PulseMetric>("athletes");

  const activeMetric = METRICS.find((item) => item.key === metric) ?? METRICS[0];
  const values = series?.[metric] ?? [];
  const current = values.at(-1) ?? null;
  const previous = values.at(-2) ?? null;
  const delta = current !== null && previous !== null ? current - previous : null;
  // Una academia nueva devuelve series a cero: eso es «sin datos», no una línea plana.
  const hasSignal = values.some((value) => value !== 0);
  const path = useMemo(() => (hasSignal ? linePath(values, 640, 180) : ""), [values, hasSignal]);

  return (
    <section className="overflow-hidden rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white">
      <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl font-black uppercase leading-none text-foreground">Pulso operativo</h2>
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-semibold",
              status === "ready" ? "bg-chalk-dust text-ramp-600" : status === "error" ? "bg-signal-wash text-signal-ink" : "bg-mat-wash text-mat-deep"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", status === "ready" ? "bg-mat" : status === "error" ? "bg-signal" : "bg-mat-light animate-pulse motion-reduce:animate-none")} />
              {status === "ready" ? (hasSignal ? "Serie actual" : "Sin datos") : status === "error" ? "Sin conexión" : "Cargando datos"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Evolución de los últimos 14 días</p>
        </div>

        <div className="flex max-w-full gap-1 overflow-x-auto border-b border-chalk-line" role="tablist" aria-label="Métrica del pulso operativo">
          {METRICS.map((item) => {
            const Icon = item.icon;
            const selected = item.key === metric;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMetric(item.key)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors duration-200",
                  selected ? "bg-white text-mat-night ring-1 ring-chalk-line" : "text-ramp-600 hover:text-mat-night"
                )}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: selected ? item.color : undefined }} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[180px_1fr] lg:items-center">
        <div>
          <p className="font-display tabular text-5xl font-black leading-none text-mat-night">
            {current === null ? "—" : (
              <CountUp
                key={metric}
                value={current}
                suffix={metric === "attendance" ? "%" : undefined}
                duration={400}
              />
            )}
          </p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {activeMetric.currentLabel(current ?? 0)}
          </p>
          {delta === null ? (
            <p className="mt-3 text-xs font-semibold text-muted-foreground">Sin serie comparable</p>
          ) : (
            <p className={cn("mt-3 inline-flex items-center gap-1 text-xs font-semibold", delta >= 0 ? "text-zaltyko-teal" : "text-destructive")}>
              <ArrowUpRight className={cn("h-3.5 w-3.5", delta < 0 && "rotate-90")} />
              {delta === 0 ? "Sin cambios" : `${delta > 0 ? "+" : ""}${delta} vs. ayer`}
            </p>
          )}
        </div>

        <div className="min-h-[180px] rounded-lg border border-chalk-line bg-chalk px-2 py-3">
          {path ? (
            <svg key={metric} viewBox="0 0 640 180" className="h-[180px] w-full" role="img" aria-label={`Evolución de ${activeMetric.label.toLowerCase()} en los últimos 14 días`}>
              
              {/* La línea se dibuja al montar y al cambiar de métrica (reduced-motion: aparece directa) */}
              <path
                d={path}
                fill="none"
                stroke={activeMetric.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
                className="zk-draw-line"
              />
              <line x1="10" x2="630" y1="170" y2="170" stroke="currentColor" strokeOpacity="0.15" strokeDasharray="4 8" />
            </svg>
          ) : (
            <div className="flex h-full min-h-[150px] items-center justify-center text-sm text-muted-foreground">
              {status === "loading" ? (
                "Cargando evolución…"
              ) : status === "error" ? (
                <div className="flex flex-col items-center gap-2 text-center">
                  <span>No pudimos cargar la evolución.</span>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="min-h-11 rounded-md border border-ramp-300 bg-white px-4 text-sm font-semibold text-mat-night transition hover:border-mat hover:text-mat"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <span className="max-w-xs text-center">
                  Sin datos todavía. La evolución aparece cuando registres {activeMetric.label.toLowerCase()} y asistencia.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
