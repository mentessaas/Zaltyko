"use client";

import { useState, useEffect } from "react";
import { Calendar, Download, FileText, BarChart3, Loader2, Filter } from "lucide-react";
import { format, subDays, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface AttendanceStats {
  totalSessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendanceRate: number;
}

interface AttendanceReportProps {
  academyId: string;
  initialData?: {
    type: "general" | "athlete" | "group";
    data: any;
  };
}

export function AttendanceReport({ academyId, initialData }: AttendanceReportProps) {
  const [reportType, setReportType] = useState<"general" | "athlete" | "group">("general");
  const [startDate, setStartDate] = useState(format(subMonths(new Date(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [athleteId, setAthleteId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [classId, setClassId] = useState("");
  const [reportData, setReportData] = useState<any>(initialData?.data);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        academyId,
        reportType,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(athleteId && { athleteId }),
        ...(groupId && { groupId }),
        ...(classId && { classId }),
      });

      const response = await fetch(`/api/reports/attendance?${params}`);
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

  useEffect(() => {
    if (initialData) {
      setReportData(initialData.data);
      setReportType(initialData.type);
    }
  }, [initialData]);

  const handleExportPDF = async () => {
    try {
      const params = new URLSearchParams({
        academyId,
        reportType,
        format: "pdf",
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(athleteId && { athleteId }),
        ...(groupId && { groupId }),
        ...(classId && { classId }),
      });

      const response = await fetch(`/api/reports/attendance/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-asistencia-${format(new Date(), "yyyy-MM-dd")}.pdf`;
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
        reportType,
        format: "excel",
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(athleteId && { athleteId }),
        ...(groupId && { groupId }),
        ...(classId && { classId }),
      });

      const response = await fetch(`/api/reports/attendance/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar Excel");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-asistencia-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Error al exportar Excel: " + err.message);
    }
  };

  const renderGeneralReport = (stats: AttendanceStats) => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Sesiones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSessions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Tasa de Asistencia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.attendanceRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Presentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.present}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Desglose de Asistencia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Presentes:</span>
              <Badge variant="outline" className="bg-green-50">
                {stats.present}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Ausentes:</span>
              <Badge variant="outline" className="bg-red-50">
                {stats.absent}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Tarde:</span>
              <Badge variant="outline" className="bg-yellow-50">
                {stats.late}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Justificados:</span>
              <Badge variant="outline" className="bg-blue-50">
                {stats.excused}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico simple usando barras de progreso */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Gráfico de Asistencia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Presentes</span>
                <span>{stats.totalSessions > 0 ? Math.round((stats.present / stats.totalSessions) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{ width: `${stats.totalSessions > 0 ? (stats.present / stats.totalSessions) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Ausentes</span>
                <span>{stats.totalSessions > 0 ? Math.round((stats.absent / stats.totalSessions) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-red-600 h-2 rounded-full"
                  style={{ width: `${stats.totalSessions > 0 ? (stats.absent / stats.totalSessions) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reporte de Asistencia</h2>
          <p className="text-muted-foreground mt-1">
            Genera reportes detallados de asistencia de atletas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <FileText className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="report-type">Tipo de Reporte</Label>
              <select
                id="report-type"
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="general">General</option>
                <option value="athlete">Por Atleta</option>
                <option value="group">Por Grupo</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-date">Fecha Inicio</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Fecha Fin</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {reportType === "athlete" && (
              <div className="space-y-2">
                <Label htmlFor="athlete-id">ID de Atleta</Label>
                <Input
                  id="athlete-id"
                  value={athleteId}
                  onChange={(e) => setAthleteId(e.target.value)}
                  placeholder="UUID del atleta"
                />
              </div>
            )}
            {reportType === "group" && (
              <div className="space-y-2">
                <Label htmlFor="group-id">ID de Grupo</Label>
                <Input
                  id="group-id"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  placeholder="UUID del grupo"
                />
              </div>
            )}
          </div>
          <Button onClick={loadReport} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Calendar className="mr-2 h-4 w-4" />
                Generar Reporte
              </>
            )}
          </Button>
        </CardContent>
      </Card>

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
        <Card>
          <CardHeader>
            <CardTitle>Resultados del Reporte</CardTitle>
            <CardDescription>
              Periodo: {format(new Date(startDate), "PPP", { locale: es })} -{" "}
              {format(new Date(endDate), "PPP", { locale: es })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reportType === "general" && renderGeneralReport(reportData)}
            {reportType === "athlete" && (
              <div>
                <h3 className="text-lg font-semibold mb-4">{reportData.athleteName}</h3>
                {renderGeneralReport(reportData.stats)}
              </div>
            )}
            {reportType === "group" && (
              <div className="space-y-4">
                {reportData.map((group: any) => (
                  <Card key={group.groupId}>
                    <CardHeader>
                      <CardTitle>{group.groupName}</CardTitle>
                      <CardDescription>
                        {group.totalAthletes} atletas · Tasa promedio: {group.averageAttendanceRate}%
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {group.athletes.map((athlete: any) => (
                          <div key={athlete.athleteId} className="flex justify-between">
                            <span>{athlete.athleteName}</span>
                            <Badge>{athlete.attendanceRate}%</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

