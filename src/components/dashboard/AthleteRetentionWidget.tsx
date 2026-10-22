"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AthleteRetentionWidgetProps {
  academyId: string;
}

interface RetentionData {
  retentionRate: number;
  previousRetentionRate: number;
  monthlyData: Array<{ month: string; active: number; churned: number; new: number }>;
}

function readPayload(payload: unknown): RetentionData | null {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as { data?: unknown };
  const value = envelope.data && typeof envelope.data === "object" ? envelope.data : payload;
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<RetentionData>;
  if (!Array.isArray(data.monthlyData)) return null;
  return {
    retentionRate: Number.isFinite(Number(data.retentionRate)) ? Number(data.retentionRate) : 0,
    previousRetentionRate: Number.isFinite(Number(data.previousRetentionRate)) ? Number(data.previousRetentionRate) : 0,
    monthlyData: data.monthlyData.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { month?: unknown; active?: unknown; churned?: unknown; new?: unknown };
      if (typeof row.month !== "string") return [];
      return [{
        month: row.month,
        active: Math.max(0, Number(row.active) || 0),
        churned: Math.max(0, Number(row.churned) || 0),
        new: Math.max(0, Number(row.new) || 0),
      }];
    }),
  };
}

function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("es", { month: "short" }).format(new Date(year, month - 1, 1)).replace(".", "");
}

export function AthleteRetentionWidget({ academyId }: AthleteRetentionWidgetProps) {
  const [data, setData] = useState<RetentionData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus("loading");
    try {
      const response = await fetch(`/api/dashboard/${encodeURIComponent(academyId)}/retention`, {
        signal,
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error(`retention_${response.status}`);
      const parsed = readPayload(await response.json());
      if (!parsed) throw new Error("retention_invalid_payload");
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

  const monthlyData = data?.monthlyData ?? [];
  const hasRetentionActivity = Boolean(data && monthlyData.some(
    (item) => item.active > 0 || item.new > 0 || item.churned > 0
  ));
  const delta = data && data.previousRetentionRate > 0
    ? data.retentionRate - data.previousRetentionRate
    : null;

  return (
    <Card className="border-border/80 shadow-soft">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display font-semibold">
          <Users className="h-5 w-5 text-zaltyko-indigo dark:text-zaltyko-electric" />
          Retención de atletas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "loading" && !data ? (
          <div className="h-48 animate-pulse rounded-xl bg-muted" aria-label="Cargando retención de atletas" />
        ) : status === "error" && !data ? (
          <div className="space-y-3 rounded-xl border border-dashed border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">No pudimos cargar la retención de atletas.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        ) : monthlyData.length === 0 || !hasRetentionActivity ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center">
            <p className="text-sm font-medium text-foreground">Aún no hay datos de retención</p>
            <p className="mt-1 text-xs text-muted-foreground">Necesitamos actividad de atletas para mostrar una tendencia real.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-display font-bold text-foreground">{data?.retentionRate.toFixed(1)}%</p>
                <p className="text-sm text-muted-foreground">Atletas activos actualmente</p>
              </div>
              {delta === null ? (
                <span className="text-xs text-muted-foreground">Sin base comparable</span>
              ) : (
                <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${delta >= 0 ? "bg-zaltyko-teal/12 text-zaltyko-teal" : "bg-zaltyko-coral/12 text-zaltyko-coral"}`}>
                  {delta >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  {delta >= 0 ? "+" : ""}{delta.toFixed(1)} pp
                </span>
              )}
            </div>
            <div className="space-y-1.5" aria-label="Retención de los últimos seis meses">
              {monthlyData.map((item, index) => {
                const maxActive = Math.max(...monthlyData.map((entry) => entry.active), 1);
                const isCurrentMonth = index === monthlyData.length - 1;
                return (
                  <div key={item.month} className="flex items-center gap-3">
                    <span className="w-8 text-xs capitalize text-muted-foreground">{monthLabel(item.month)}</span>
                    <div className="h-2 flex-1 rounded-full bg-zaltyko-mist/50" title={`${item.active} atletas activos; ${item.new} altas; ${item.churned} bajas`}>
                      <div
                        className={`h-full rounded-full transition-all ${isCurrentMonth ? "bg-zaltyko-teal" : "bg-zaltyko-indigo/30 dark:bg-zaltyko-electric/35"}`}
                        style={{ width: `${Math.max((item.active / maxActive) * 100, item.active > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-xs font-medium text-foreground">{item.active} activos</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
