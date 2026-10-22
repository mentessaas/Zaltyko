"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { formatCurrency, getCurrencyForCountry } from "@/lib/currency";

interface RevenueTrendChartProps {
  academyId: string;
}

interface RevenueTrendData {
  currentMonthRevenue: number;
  previousMonthRevenue: number;
  monthlyTrend: Array<{ month: string; revenue: number }>;
}

function readPayload(payload: unknown): RevenueTrendData | null {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as { data?: unknown };
  const value = envelope.data && typeof envelope.data === "object" ? envelope.data : payload;
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<RevenueTrendData>;
  if (!Array.isArray(data.monthlyTrend)) return null;
  return {
    currentMonthRevenue: Number.isFinite(Number(data.currentMonthRevenue)) ? Number(data.currentMonthRevenue) : 0,
    previousMonthRevenue: Number.isFinite(Number(data.previousMonthRevenue)) ? Number(data.previousMonthRevenue) : 0,
    monthlyTrend: data.monthlyTrend.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { month?: unknown; revenue?: unknown };
      if (typeof row.month !== "string") return [];
      const revenue = Number(row.revenue);
      return [{ month: row.month, revenue: Number.isFinite(revenue) ? Math.max(0, revenue) : 0 }];
    }),
  };
}

function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("es", { month: "short" }).format(new Date(year, month - 1, 1)).replace(".", "");
}

export function RevenueTrendChart({ academyId }: RevenueTrendChartProps) {
  const { academyCountry } = useAcademyContext();
  const currency = getCurrencyForCountry(academyCountry);
  const [data, setData] = useState<RevenueTrendData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus("loading");
    try {
      const response = await fetch(`/api/dashboard/${encodeURIComponent(academyId)}/revenue-trend`, {
        signal,
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error(`revenue_trend_${response.status}`);
      const parsed = readPayload(await response.json());
      if (!parsed) throw new Error("revenue_trend_invalid_payload");
      if (!signal?.aborted) {
        setData(parsed);
        setStatus("ready");
      }
    } catch {
      if (!signal?.aborted) setStatus("error");
    }
  }, [academyId]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const trend = useMemo(() => data?.monthlyTrend ?? [], [data]);
  const maxRevenue = useMemo(() => Math.max(...trend.map((item) => item.revenue), 1), [trend]);
  const hasRevenue = Boolean(data && (
    data.currentMonthRevenue > 0 ||
    data.previousMonthRevenue > 0 ||
    trend.some((item) => item.revenue > 0)
  ));
  const delta = data && data.previousMonthRevenue > 0
    ? ((data.currentMonthRevenue - data.previousMonthRevenue) / data.previousMonthRevenue) * 100
    : null;

  return (
    <Card className="border-border/80 shadow-soft">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display font-semibold">
          <TrendingUp className="h-5 w-5 text-zaltyko-teal" />
          Tendencia de ingresos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status === "loading" && !data ? (
          <div className="h-48 animate-pulse rounded-xl bg-muted" aria-label="Cargando tendencia de ingresos" />
        ) : status === "error" && !data ? (
          <div className="space-y-3 rounded-xl border border-dashed border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">No pudimos cargar la tendencia de ingresos.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        ) : trend.length === 0 || !hasRevenue ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center">
            <p className="text-sm font-medium text-foreground">Aún no hay ingresos registrados</p>
            <p className="mt-1 text-xs text-muted-foreground">Cuando registres cobros aparecerán aquí, sin datos de ejemplo.</p>
          </div>
        ) : (
          <>
            <div className="flex h-36 items-end justify-between gap-2" aria-label="Ingresos de los últimos seis meses">
              {trend.map((item, index) => {
                const height = item.revenue > 0 ? Math.max((item.revenue / maxRevenue) * 100, 4) : 2;
                const isLast = index === trend.length - 1;
                return (
                  <div key={item.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <div className="flex h-28 w-full items-end" title={`${monthLabel(item.month)}: ${formatCurrency(item.revenue, currency)}`}>
                      <div
                        className={`w-full rounded-t-lg transition-all ${isLast ? "bg-zaltyko-teal" : "bg-zaltyko-indigo/20 dark:bg-zaltyko-electric/30"}`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="text-xs capitalize text-muted-foreground">{monthLabel(item.month)}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/40 p-3">
              <div>
                <span className="text-sm text-muted-foreground">Este mes</span>
                <p className="text-base font-semibold text-foreground">{formatCurrency(data?.currentMonthRevenue ?? 0, currency)}</p>
              </div>
              {delta === null ? (
                <span className="text-xs text-muted-foreground">Sin mes anterior comparable</span>
              ) : (
                <span className={`flex items-center gap-1 text-sm font-semibold ${delta >= 0 ? "text-zaltyko-teal" : "text-zaltyko-coral"}`}>
                  {delta >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
