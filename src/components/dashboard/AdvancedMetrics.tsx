"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Users, DollarSign, Activity, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AdvancedMetricsData {
  retentionRate: number;
  averageAttendanceRate: number;
  monthlyRecurringRevenue: number;
  churnRate: number;
  growthProjection: number;
  periodComparison: {
    current: {
      athletes: number;
      revenue: number;
      attendance: number;
    };
    previous: {
      athletes: number;
      revenue: number;
      attendance: number;
    };
    change: {
      athletes: number;
      revenue: number;
      attendance: number;
    };
  };
}

interface AdvancedMetricsProps {
  academyId: string;
}

export function AdvancedMetrics({ academyId }: AdvancedMetricsProps) {
  const [metrics, setMetrics] = useState<AdvancedMetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
  }, [academyId]);

  const loadMetrics = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/dashboard/${academyId}/analytics`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al cargar métricas");
      }

      setMetrics(data.data);
    } catch (err: any) {
      setError(err.message || "Error al cargar métricas");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Tasa de Retención
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.retentionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Atletas activos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Asistencia Promedio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.averageAttendanceRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Últimos 30 días</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Ingresos Recurrentes (MRR)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.monthlyRecurringRevenue.toFixed(2)} €</div>
            <p className="text-xs text-muted-foreground mt-1">Mes actual</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Proyección de Crecimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.growthProjection > 0 ? "+" : ""}
              {metrics.growthProjection.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Próximo mes</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comparativa de Períodos</CardTitle>
          <CardDescription>Comparación mes actual vs mes anterior</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Ingresos</p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {metrics.periodComparison.current.revenue.toFixed(2)} €
                </span>
                {metrics.periodComparison.change.revenue !== 0 && (
                  <Badge
                    variant={metrics.periodComparison.change.revenue > 0 ? "default" : "error"}
                    className="flex items-center gap-1"
                  >
                    {metrics.periodComparison.change.revenue > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {metrics.periodComparison.change.revenue > 0 ? "+" : ""}
                    {metrics.periodComparison.change.revenue.toFixed(1)}%
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Anterior: {metrics.periodComparison.previous.revenue.toFixed(2)} €
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Asistencia</p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {metrics.periodComparison.current.attendance}
                </span>
                {metrics.periodComparison.change.attendance !== 0 && (
                  <Badge
                    variant={
                      metrics.periodComparison.change.attendance > 0 ? "default" : "error"
                    }
                    className="flex items-center gap-1"
                  >
                    {metrics.periodComparison.change.attendance > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {metrics.periodComparison.change.attendance > 0 ? "+" : ""}
                    {metrics.periodComparison.change.attendance.toFixed(1)}%
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Anterior: {metrics.periodComparison.previous.attendance}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Tasa de Abandono</p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{metrics.churnRate.toFixed(1)}%</span>
                {metrics.churnRate > 10 && (
                  <Badge variant="error">Alta</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Últimos 60 días</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

