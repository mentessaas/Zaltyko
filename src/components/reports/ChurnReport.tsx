"use client";

import { useState, useEffect } from "react";
import { UserMinus, Download, FileText, BarChart3, Loader2, TrendingDown, AlertTriangle } from "lucide-react";
import { format, subMonths } from "date-fns";
import { formatLongDateForCountry } from "@/lib/date-utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportFilters, ReportFilters as ReportFiltersType } from "@/components/reports/ReportFilters";
import { ExportButtons } from "@/components/reports/ExportButtons";

interface ChurnStats {
  totalChurned: number;
  churnRate: number;
  voluntaryChurn: number;
  involuntaryChurn: number;
  reasons: ChurnReason[];
  recentChurns: ChurnedAthlete[];
}

interface ChurnReason {
  reason: string;
  count: number;
  percentage: number;
}

interface ChurnedAthlete {
  athleteId: string;
  athleteName: string;
  churnDate: string;
  reason: string;
  membershipEndDate: string;
  monthsActive: number;
}

interface ChurnReportProps {
  academyId: string;
  academyCountry?: string | null;
}

export function ChurnReport({ academyId, academyCountry }: ChurnReportProps) {
  const [filters, setFilters] = useState<ReportFiltersType>({
    startDate: format(subMonths(new Date(), 3), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    datePreset: "last-90-days",
  });
  const [reportData, setReportData] = useState<ChurnStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        academyId,
        startDate: filters.startDate,
        endDate: filters.endDate,
      });

      const response = await fetch(`/api/reports/churn?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al generar reporte");
      }

      setReportData(data.data);
    } catch (err: any) {
      setError(err.message || "Error al generar reporte");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      const params = new URLSearchParams({
        academyId,
        format: "pdf",
        startDate: filters.startDate,
        endDate: filters.endDate,
      });

      const response = await fetch(`/api/reports/churn/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-bajas-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Error al exportar PDF: " + err.message);
    }
  };

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams({
        academyId,
        format: "excel",
        startDate: filters.startDate,
        endDate: filters.endDate,
      });

      const response = await fetch(`/api/reports/churn/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar Excel");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-bajas-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Error al exportar Excel: " + err.message);
    }
  };

  const handleSendEmail = async (email: string) => {
    try {
      const params = new URLSearchParams({
        academyId,
        email,
        startDate: filters.startDate,
        endDate: filters.endDate,
      });

      const response = await fetch(`/api/reports/churn/email?${params}`);
      if (!response.ok) throw new Error("Error al enviar email");

      alert("Reporte enviado exitosamente");
    } catch (err: any) {
      alert("Error al enviar email: " + err.message);
    }
  };

  // Load report on mount
  useEffect(() => {
    loadReport();
  }, []);

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      "financial": "Financiero",
      "relocation": "Traslado",
      "dissatisfaction": "Insatisfacción",
      "injury": "Lesión",
      "schedule": "Horario",
      "other": "Otro",
      "payment_failed": "Pago fallido",
    };
    return labels[reason] || reason;
  };

  const getReasonColor = (reason: string) => {
    const colors: Record<string, string> = {
      "financial": "bg-red-100 text-red-800",
      "relocation": "bg-blue-100 text-blue-800",
      "dissatisfaction": "bg-orange-100 text-orange-800",
      "injury": "bg-yellow-100 text-yellow-800",
      "schedule": "bg-purple-100 text-purple-800",
      "other": "bg-gray-100 text-gray-800",
      "payment_failed": "bg-red-100 text-red-800",
    };
    return colors[reason] || "bg-gray-100";
  };

  const renderChurnReasons = () => {
    if (!reportData?.reasons?.length) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Razones de Baja
          </CardTitle>
          <CardDescription>
            Distribución de razones por las que los atletas se dan de baja
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {reportData.reasons.map((item) => (
              <div key={item.reason} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={getReasonColor(item.reason)}>
                      {getReasonLabel(item.reason)}
                    </Badge>
                  </div>
                  <span className="text-sm font-medium">{item.count} ({item.percentage}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderRecentChurns = () => {
    if (!reportData?.recentChurns?.length) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserMinus className="h-5 w-5" />
            Bajas Recientes
          </CardTitle>
          <CardDescription>
            Atletas dados de baja recientemente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {reportData.recentChurns.map((athlete) => (
              <div
                key={athlete.athleteId}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div>
                  <p className="font-medium">{athlete.athleteName}</p>
                  <p className="text-xs text-muted-foreground">
                    {athlete.monthsActive} meses activo{athlete.monthsActive !== 1 ? "s" : ""} · Dio baja el{" "}
                    {formatLongDateForCountry(athlete.churnDate, academyCountry)}
                  </p>
                </div>
                <Badge className={getReasonColor(athlete.reason)}>
                  {getReasonLabel(athlete.reason)}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reporte de Bajas</h2>
          <p className="text-muted-foreground mt-1">
            Análisis de atletas dados de baja y sus razones
          </p>
        </div>
        <ExportButtons
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onSendEmail={handleSendEmail}
          reportTitle="Reporte de Bajas"
          isExporting={isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ReportFilters
            onFilterChange={setFilters}
            onGenerate={loadReport}
            isLoading={isLoading}
          />
        </div>

        <div className="lg:col-span-2 space-y-6">
          {error && (
            <Card>
              <CardContent className="pt-6">
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  {error}
                </div>
              </CardContent>
            </Card>
          )}

          {reportData && !isLoading && (
            <>
              {/* Summary Stats */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Total Bajas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.totalChurned}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingDown className="h-4 w-4" />
                      Tasa de Baja
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{reportData.churnRate}%</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Voluntarias</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.voluntaryChurn}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Involuntarias</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.involuntaryChurn}</div>
                  </CardContent>
                </Card>
              </div>

              {renderChurnReasons()}
              {renderRecentChurns()}

              {/* Period Info */}
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">
                    Periodo: {formatLongDateForCountry(filters.startDate, academyCountry)} -{" "}
                    {formatLongDateForCountry(filters.endDate, academyCountry)}
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          {isLoading && (
            <Card>
              <CardContent className="pt-6 flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
