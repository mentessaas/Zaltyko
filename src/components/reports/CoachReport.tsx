"use client";

import { useState, useEffect } from "react";
import { UserCog, Download, FileText, BarChart3, Loader2, TrendingUp, Calendar } from "lucide-react";
import { format, subMonths } from "date-fns";
import { formatLongDateForCountry } from "@/lib/date-utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportFilters, ReportFilters as ReportFiltersType } from "@/components/reports/ReportFilters";
import { ExportButtons } from "@/components/reports/ExportButtons";

interface CoachStats {
  totalCoaches: number;
  activeCoaches: number;
  totalClasses: number;
  averageRating: number;
  coachPerformance: CoachPerformance[];
}

interface CoachPerformance {
  coachId: string;
  coachName: string;
  classesCount: number;
  athletesCount: number;
  averageAttendance: number;
  sessionsConducted: number;
}

interface CoachReportProps {
  academyId: string;
  academyCountry?: string | null;
}

export function CoachReport({ academyId, academyCountry }: CoachReportProps) {
  const [filters, setFilters] = useState<ReportFiltersType>({
    startDate: format(subMonths(new Date(), 1), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    datePreset: "last-30-days",
  });
  const [reportData, setReportData] = useState<CoachStats | null>(null);
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
        ...(filters.coachId && { coachId: filters.coachId }),
      });

      const response = await fetch(`/api/reports/coach?${params}`);
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

      const response = await fetch(`/api/reports/coach/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-entrenadores-${format(new Date(), "yyyy-MM-dd")}.pdf`;
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

      const response = await fetch(`/api/reports/coach/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar Excel");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-entrenadores-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
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

      const response = await fetch(`/api/reports/coach/email?${params}`);
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

  const renderCoachPerformance = () => {
    if (!reportData?.coachPerformance?.length) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Rendimiento por Entrenador
          </CardTitle>
          <CardDescription>
            Métricas de rendimiento de cada entrenador
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {reportData.coachPerformance.map((coach) => (
              <div key={coach.coachId} className="p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserCog className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{coach.coachName}</p>
                      <p className="text-xs text-muted-foreground">
                        {coach.classesCount} clases · {coach.athletesCount} atletas
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-green-50">
                    {coach.averageAttendance}% asistencia
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-lg font-bold">{coach.sessionsConducted}</p>
                    <p className="text-xs text-muted-foreground">Sesiones</p>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-lg font-bold">{coach.classesCount}</p>
                    <p className="text-xs text-muted-foreground">Clases</p>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-lg font-bold">{coach.athletesCount}</p>
                    <p className="text-xs text-muted-foreground">Atletas</p>
                  </div>
                </div>
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
          <h2 className="text-2xl font-bold">Reporte de Entrenadores</h2>
          <p className="text-muted-foreground mt-1">
            Análisis de rendimiento de entrenadores
          </p>
        </div>
        <ExportButtons
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onSendEmail={handleSendEmail}
          reportTitle="Reporte de Entrenadores"
          isExporting={isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ReportFilters
            onFilterChange={setFilters}
            onGenerate={loadReport}
            isLoading={isLoading}
            showCoachFilter
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
                    <CardTitle className="text-sm font-medium">Total Entrenadores</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.totalCoaches}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Activos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{reportData.activeCoaches}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Clases Asignadas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.totalClasses}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Calificación Prom.</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {reportData.averageRating > 0 ? reportData.averageRating.toFixed(1) : "N/A"}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {renderCoachPerformance()}

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
