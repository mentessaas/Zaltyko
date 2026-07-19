"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Stats {
  period: string;
  collectedCents: number;
  pendingCents: number;
  overdueCents: number;
  failedCents: number;
  paidCount: number;
  overdueCount: number;
  failedCount: number;
  autoPaidCount: number;
  manualPaidCount: number;
  successRate: number;
}

interface Props {
  academyId: string;
}

function formatEur(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * Dashboard financiero de cobros del mes: cobrado, pendiente, fallidos, morosos,
 * reparto automático/manual y % de éxito. Consume /api/billing/collection-stats.
 */
export function CollectionStatsCard({ academyId }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/billing/collection-stats?academyId=${academyId}`);
      const json = await res.json();
      if (res.ok && json.ok) setStats(json.data as Stats);
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobros de este mes</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-zaltyko-text-secondary">Cargando…</p>
        ) : !stats ? (
          <p className="text-sm text-zaltyko-text-secondary">Sin datos.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Cobrado" value={formatEur(stats.collectedCents)} tone="ok" />
            <Metric label="Pendiente" value={formatEur(stats.pendingCents)} />
            <Metric label="Fallidos" value={`${stats.failedCount}`} tone="bad" />
            <Metric label="Morosos" value={`${stats.overdueCount}`} tone="warn" />
            <Metric label="% éxito" value={`${stats.successRate}%`} tone="ok" />
            <Metric
              label="Automáticos / manuales"
              value={`${stats.autoPaidCount} / ${stats.manualPaidCount}`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad" | "warn";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-red-600"
        : tone === "warn"
          ? "text-amber-600"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-zaltyko-mist bg-white p-3">
      <p className="text-xs text-zaltyko-text-secondary">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
