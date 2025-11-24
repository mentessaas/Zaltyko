"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DollarSign, CreditCard, Award, ArrowRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface FinancialMetricsWidgetProps {
  academyId: string;
}

interface FinancialMetrics {
  monthlyRevenue: number;
  pendingPayments: number;
  pendingPaymentsCount: number;
  activeScholarships: number;
}

export function FinancialMetricsWidget({ academyId }: FinancialMetricsWidgetProps) {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
    // Recargar cada 5 minutos
    const interval = setInterval(loadMetrics, 300000);
    return () => clearInterval(interval);
  }, [academyId]);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard/${academyId}/financial-metrics`);
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error("Error loading financial metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !metrics) {
    return null;
  }

  if (!metrics) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
            Métricas financieras
          </p>
          <h3 className="text-lg font-semibold text-foreground">Resumen financiero</h3>
        </div>
        <Link
          href={`/app/${academyId}/reports/financial`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition hover:underline"
        >
          Ver reporte completo
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Ingresos del mes */}
        <div className="rounded-xl border border-border/60 bg-background/80 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Ingresos del mes</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                €{metrics.monthlyRevenue.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Pagos pendientes */}
        <div className="rounded-xl border border-border/60 bg-background/80 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2">
              <CreditCard className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Pagos pendientes</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                €{metrics.pendingPayments.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {metrics.pendingPaymentsCount} {metrics.pendingPaymentsCount === 1 ? "cargo" : "cargos"}
              </p>
            </div>
          </div>
        </div>

        {/* Becas activas */}
        <div className="rounded-xl border border-border/60 bg-background/80 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-500/10 p-2">
              <Award className="h-5 w-5 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Becas activas</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {metrics.activeScholarships}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

