"use client";

import { useState, useEffect } from "react";
import { GraduationCap, Download, FileText, BarChart3, Loader2, Users } from "lucide-react";
import { format, subMonths } from "date-fns";
import { formatLongDateForCountry } from "@/lib/date-utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";
import { ReportFilters, ReportFilters as ReportFiltersType } from "@/components/reports/ReportFilters";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { useAcademyContext } from "@/hooks/use-academy-context";

interface ClassStats {
  totalClasses: number;
  totalSessions: number;
  totalEnrollments: number;
  averageAttendance: number;
  popularClasses: PopularClass[];
}

interface PopularClass {
  classId: string;
  className: string;
  enrollments: number;
  averageAttendance: number;
  attendanceRate: number;
}

interface ClassReportProps {
  academyId: string;
  academyCountry?: string | null;
}

export function ClassReport({ academyId, academyCountry }: ClassReportProps) {
  const toast = useToast();
  const { specialization } = useAcademyContext();
  const [filters, setFilters] = useState<ReportFiltersType>({
    startDate: format(subMonths(new Date(), 1), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    datePreset: "last-30-days",
  });
  const [reportData, setReportData] = useState<ClassStats | null>(null);
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
        ...(filters.classId && { classId: filters.classId }),
        ...(filters.groupId && { groupId: filters.groupId }),
      });

      const response = await fetch(`/api/reports/class?${params}`);
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

      const response = await fetch(`/api/reports/class/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-clases-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.pushToast({
        title: "PDF exportado",
        description: "El reporte de clases se descargó correctamente.",
        variant: "success",
      });
    } catch (err: any) {
      toast.pushToast({
        title: "No se pudo exportar el PDF",
        description: err.message || "Inténtalo de nuevo en unos segundos.",
        variant: "error",
      });
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

      const response = await fetch(`/api/reports/class/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar Excel");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-clases-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.pushToast({
        title: "Excel exportado",
        description: "El reporte de clases se descargó correctamente.",
        variant: "success",
      });
    } catch (err: any) {
      toast.pushToast({
        title: "No se pudo exportar el Excel",
        description: err.message || "Inténtalo de nuevo en unos segundos.",
        variant: "error",
      });
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

      const response = await fetch(`/api/reports/class/email?${params}`);
      if (!response.ok) throw new Error("Error al enviar email");

      toast.pushToast({
        title: "Reporte enviado",
        description: `Enviamos el reporte de clases a ${email}.`,
        variant: "success",
      });
    } catch (err: any) {
      toast.pushToast({
        title: "No se pudo enviar el reporte",
        description: err.message || "Revisa el correo e inténtalo otra vez.",
        variant: "error",
      });
    }
  };

  // Load report on mount
  useEffect(() => {
    loadReport();
  }, []);

  const renderPopularClasses = () => {
    if (!reportData?.popularClasses?.length) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {specialization.labels.classLabel}s Más Populares
          </CardTitle>
          <CardDescription>
            {specialization.labels.classLabel}s con mayor inscripción y asistencia
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {reportData.popularClasses.map((cls, index) => (
              <div key={cls.classId} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">{cls.className}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {cls.enrollments} inscritos
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="bg-green-50">
                    {cls.attendanceRate}% asistencia
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cls.averageAttendance} promedio
                  </p>
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
          <h2 className="text-2xl font-bold">Reporte de Clases</h2>
          <p className="text-muted-foreground mt-1">
            Análisis de {specialization.labels.classLabel.toLowerCase()}s populares y asistencia
          </p>
        </div>
        <ExportButtons
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onSendEmail={handleSendEmail}
          reportTitle="Reporte de Clases"
          isExporting={isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ReportFilters
            academyId={academyId}
            onFilterChange={setFilters}
            onGenerate={loadReport}
            isLoading={isLoading}
            showGroupFilter
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
                    <CardTitle className="text-sm font-medium">Total Clases</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.totalClasses}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Sesiones</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.totalSessions}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Inscripciones</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.totalEnrollments}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Asistencia Prom.</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.averageAttendance}%</div>
                  </CardContent>
                </Card>
              </div>

              {renderPopularClasses()}

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
