"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, BarChart3, Users, UserCheck } from "lucide-react";

import { cn } from "@/lib/utils";

type PulseMetric = "athletes" | "coaches" | "groups" | "attendance";
type TrendSeries = Record<PulseMetric, number[]>;

const METRICS: Array<{ key: PulseMetric; label: string; icon: typeof Users; color: string }> = [
  { key: "athletes", label: "Gimnastas", icon: Users, color: "#00796B" },
  { key: "coaches", label: "Equipo", icon: UserCheck, color: "#2B2E83" },
  { key: "groups", label: "Grupos", icon: BarChart3, color: "#E06B45" },
  { key: "attendance", label: "Asistencia", icon: Activity, color: "#D09A2C" },
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

export function OperationsPulse({ academyId }: { academyId: string }) {
  const [metric, setMetric] = useState<PulseMetric>("athletes");
  const [series, setSeries] = useState<TrendSeries | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard/kpi-trends?academyId=${academyId}&days=14`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (json?.ok && json.data) setSeries(json.data as TrendSeries);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [academyId]);

  const activeMetric = METRICS.find((item) => item.key === metric) ?? METRICS[0];
  const values = series?.[metric] ?? [];
  const current = values.at(-1) ?? null;
  const previous = values.at(-2) ?? null;
  const delta = current !== null && previous !== null ? current - previous : null;
  const path = useMemo(() => linePath(values, 640, 180), [values]);

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_50px_-28px_rgba(15,23,42,0.38)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Ritmo de la academia</p>
          <div className="mt-1 flex items-center gap-3">
            <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-slate-950">Pulso operativo</h2>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
              series ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", series ? "bg-slate-400" : "bg-amber-500")} />
              {series ? "Serie actual" : "Cargando datos"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Evolución de los últimos 14 días</p>
        </div>

        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-50 p-1" role="tablist" aria-label="Métrica del pulso operativo">
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
                  "flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors",
                  selected ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
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
          <p className="text-4xl font-bold tracking-[-0.04em] text-slate-950">
            {current === null ? "—" : metric === "attendance" ? `${current}%` : current}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">{activeMetric.label.toLowerCase()} actuales</p>
          {delta === null ? (
            <p className="mt-3 text-xs font-semibold text-slate-400">Sin serie comparable</p>
          ) : (
            <p className={cn("mt-3 inline-flex items-center gap-1 text-xs font-semibold", delta >= 0 ? "text-emerald-700" : "text-rose-600")}>
              <ArrowUpRight className={cn("h-3.5 w-3.5", delta < 0 && "rotate-90")} />
              {delta === 0 ? "Sin cambios" : `${delta > 0 ? "+" : ""}${delta} vs. ayer`}
            </p>
          )}
        </div>

        <div className="min-h-[180px] rounded-2xl bg-slate-950/[0.025] px-2 py-3">
          {path ? (
            <svg viewBox="0 0 640 180" className="h-[180px] w-full" role="img" aria-label={`Evolución de ${activeMetric.label.toLowerCase()} en los últimos 14 días`}>
              <defs>
                <linearGradient id="pulse-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={activeMetric.color} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={activeMetric.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${path} L630 170 L10 170 Z`} fill="url(#pulse-fill)" />
              <path d={path} fill="none" stroke={activeMetric.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
              <line x1="10" x2="630" y1="170" y2="170" stroke="#E2E8F0" strokeDasharray="4 8" />
            </svg>
          ) : (
            <div className="flex h-full min-h-[150px] items-center justify-center text-sm text-slate-400">
              {series ? "Aún no hay suficientes datos para dibujar la evolución." : "Cargando evolución…"}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
