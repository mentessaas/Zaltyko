"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { formatMinorCurrency, getCurrencyForCountry } from "@/lib/currency";

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

/**
 * Dashboard financiero de cobros del mes: cobrado, pendiente, fallidos, morosos,
 * reparto automático/manual y % de éxito. Consume /api/billing/collection-stats.
 */
export function CollectionStatsCard({ academyId }: Props) {
  const { academyCountry } = useAcademyContext();
  const currency = getCurrencyForCountry(academyCountry);
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
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !stats ? (
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Cobrado" value={formatMinorCurrency(stats.collectedCents, currency)} tone="ok" />
            <Metric label="Pendiente" value={formatMinorCurrency(stats.pendingCents, currency)} />
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
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
