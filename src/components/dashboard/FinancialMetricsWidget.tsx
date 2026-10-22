"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DollarSign, CreditCard, Award, ArrowRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { formatCurrency, getCurrencyForCountry } from "@/lib/currency";

interface FinancialMetricsWidgetProps {
  academyId: string;
}

interface FinancialMetrics {
  monthlyRevenue: number;
  pendingPayments: number;
  pendingPaymentsCount: number;
  activeScholarships: number;
  bySportConfig?: Array<{
    sportConfigId: string | null;
    label: string;
    paidAmount: number;
    pendingAmount: number;
    overdueAmount: number;
    activeScholarships: number;
    discountAmount: number;
    estimatedCostAmount: number;
    estimatedMarginAmount: number;
    estimatedMarginRate: number | null;
    profitabilityStatus: "profitable" | "at_risk" | "loss" | "unknown";
  }>;
}

export function FinancialMetricsWidget({ academyId }: FinancialMetricsWidgetProps) {
  const { academyCountry } = useAcademyContext();
  const currency = getCurrencyForCountry(academyCountry);
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadMetrics();
    // Recargar cada 5 minutos
    const interval = setInterval(loadMetrics, 300000);
    return () => clearInterval(interval);
  }, [academyId]);

  const loadMetrics = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/dashboard/${academyId}/financial-metrics`);
      if (response.ok) {
        const payload = await response.json();
        setMetrics(payload.data ?? payload);
      } else {
        setError(true);
      }
    } catch (error) {
      logger.error("Error loading financial metrics:", error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !metrics) {
    return null;
  }

  if (!metrics) {
    if (!error) return null;
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <span>No pudimos cargar las métricas financieras.</span>
        <button type="button" onClick={loadMetrics} className="font-semibold underline underline-offset-2" disabled={loading}>
          {loading ? "Reintentando…" : "Reintentar"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Métricas financieras
            </p>
            <h3 className="text-lg font-semibold text-foreground">Resumen financiero</h3>
          </div>
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
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 transition-shadow hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2.5">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">Ingresos del mes</p>
              <p className="mt-1 text-xl font-bold text-green-600">
                {formatCurrency(metrics.monthlyRevenue, currency)}
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
                {formatCurrency(metrics.pendingPayments, currency)}
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
            <div className="rounded-lg bg-zaltyko-indigo/10 p-2 dark:bg-zaltyko-electric/15">
              <Award className="h-5 w-5 text-zaltyko-indigo dark:text-zaltyko-electric" />
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

      {metrics.bySportConfig && metrics.bySportConfig.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Negocio por rama
              </p>
              <p className="text-sm text-muted-foreground">
                Ingresos, pendientes, morosidad, becas y descuentos separados por GAF/GAM/GR.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {metrics.bySportConfig.map((item) => (
              <div
                key={item.sportConfigId ?? "unassigned"}
                className="grid gap-2 rounded-lg border border-border/50 bg-card px-3 py-2 text-sm sm:grid-cols-7"
              >
                <span className="font-semibold text-foreground sm:col-span-2">{item.label}</span>
                <span className="text-green-700">Cobrado {formatCurrency(item.paidAmount, currency)}</span>
                <span className="text-foreground">Coste {formatCurrency(item.estimatedCostAmount, currency)}</span>
                <span className={cn(item.estimatedMarginAmount < 0 ? "text-red-700" : "text-emerald-700")}>
                  Margen {formatCurrency(item.estimatedMarginAmount, currency)}
                </span>
                <span className="text-amber-700">Pendiente {formatCurrency(item.pendingAmount, currency)}</span>
                <span className="text-red-700">Mora {formatCurrency(item.overdueAmount, currency)}</span>
                <span className="text-muted-foreground">
                  {item.activeScholarships} becas · {formatCurrency(item.discountAmount, currency)} desc.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
