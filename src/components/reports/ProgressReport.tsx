"use client";

import { useState, useEffect } from "react";
import { TrendingUp, Download, FileText, BarChart3, Loader2, Target } from "lucide-react";
import { format, subMonths } from "date-fns";
import { formatLongDateForCountry } from "@/lib/date-utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { useToast } from "@/components/ui/toast-provider";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SkillProgress {
  skillId: string;
  skillName: string;
  firstScore: number | null;
  lastScore: number | null;
  improvement: number;
  trend: "improving" | "declining" | "stable";
  assessments: Array<{
    date: string;
    score: number;
    comments: string | null;
  }>;
}

interface ProgressReportData {
  athleteId: string;
  athleteName: string;
  totalAssessments: number;
  technicalContext?: {
    primaryApparatus: string | null;
    groupName: string | null;
    technicalFocus: string | null;
    apparatus: string[];
    sessionBlocks: string[];
  } | null;
  period: {
    start: string;
    end: string;
  };
  skills: SkillProgress[];
  overallImprovement: number;
  areasOfImprovement: string[];
  areasOfConcern: string[];
}

interface ProgressReportProps {
  academyId: string;
  academyCountry?: string | null;
  athleteId?: string;
  initialData?: ProgressReportData;
}

export function ProgressReport({ academyId, academyCountry, athleteId, initialData }: ProgressReportProps) {
  const toast = useToast();
  const { specialization } = useAcademyContext();
  const [selectedAthleteId, setSelectedAthleteId] = useState(athleteId || "");
  const [startDate, setStartDate] = useState(format(subMonths(new Date(), 6), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reportData, setReportData] = useState<ProgressReportData | null>(initialData || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const fetchAthletes = async () => {
      try {
        const response = await fetch(`/api/reports/filter-options?academyId=${academyId}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) return;
        setAthletes(Array.isArray(payload.data?.athletes) ? payload.data.athletes : []);
      } catch (fetchError) {
        console.error("Error loading progress report athletes:", fetchError);
      }
    };

    fetchAthletes();
  }, [academyId]);

  const loadReport = async () => {
    if (!selectedAthleteId) {
      setError("Selecciona un atleta");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        academyId,
        athleteId: selectedAthleteId,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });

      const response = await fetch(`/api/reports/progress?${params}`);
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
      setReportData(initialData);
      if (initialData.athleteId) {
        setSelectedAthleteId(initialData.athleteId);
      }
    }
  }, [initialData]);

  const handleExportPDF = async () => {
    if (!selectedAthleteId) return;

    try {
      const params = new URLSearchParams({
        academyId,
        athleteId: selectedAthleteId,
        format: "pdf",
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });

      const response = await fetch(`/api/reports/progress/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-progreso-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      toast.pushToast({
        title: "No se pudo exportar el PDF",
        description: err.message || "Inténtalo de nuevo en unos segundos.",
        variant: "error",
      });
    }
  };

  const handleExportExcel = async () => {
    if (!selectedAthleteId) return;

    try {
      const params = new URLSearchParams({
        academyId,
        athleteId: selectedAthleteId,
        format: "excel",
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });

      const response = await fetch(`/api/reports/progress/export?${params}`);
      if (!response.ok) throw new Error("Error al exportar Excel");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-progreso-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      toast.pushToast({
        title: "No se pudo exportar el Excel",
        description: err.message || "Inténtalo de nuevo en unos segundos.",
        variant: "error",
      });
    }
  };

  const handleSendEmail = async (email: string) => {
    if (!selectedAthleteId) return;

    try {
      const params = new URLSearchParams({
        academyId,
        athleteId: selectedAthleteId,
        email,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });

      const response = await fetch(`/api/reports/progress/email?${params}`);
      if (!response.ok) throw new Error("Error al enviar email");

      toast.pushToast({
        title: "Reporte enviado",
        description: `Enviamos el reporte de progreso a ${email}.`,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reporte de Progreso</h2>
          <p className="text-muted-foreground mt-1">
            Análisis del progreso técnico de {specialization.labels.athletesPlural.toLowerCase()}
          </p>
        </div>
        {reportData && (
          <ExportButtons
            onExportPDF={handleExportPDF}
            onExportExcel={handleExportExcel}
            onSendEmail={handleSendEmail}
            reportTitle="Reporte de Progreso"
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {!athleteId && (
              <div className="space-y-2">
                <Label htmlFor="athlete-id">ID de {specialization.labels.athleteSingular} *</Label>
                <Select value={selectedAthleteId || "all"} onValueChange={(value) => setSelectedAthleteId(value === "all" ? "" : value)}>
                  <SelectTrigger id="athlete-id">
                    <SelectValue placeholder={`Selecciona ${specialization.labels.athleteSingular.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Selecciona</SelectItem>
                    {athletes.map((athlete) => (
                      <SelectItem key={athlete.id} value={athlete.id}>
                        {athlete.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
          </div>
          <Button onClick={loadReport} disabled={isLoading || !selectedAthleteId}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <TrendingUp className="mr-2 h-4 w-4" />
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
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{reportData.athleteName}</CardTitle>
              <CardDescription>
                {reportData.totalAssessments} evaluaciones · Periodo:{" "}
                {formatLongDateForCountry(reportData.period.start, academyCountry)} -{" "}
                {formatLongDateForCountry(reportData.period.end, academyCountry)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reportData.technicalContext && (
                <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">Contexto técnico actual</p>
                    {reportData.technicalContext.groupName && (
                      <p className="text-sm text-muted-foreground">
                        {specialization.labels.groupLabel}: {reportData.technicalContext.groupName}
                      </p>
                    )}
                    {reportData.technicalContext.technicalFocus && (
                      <p className="text-sm text-muted-foreground">
                        {reportData.technicalContext.technicalFocus}
                      </p>
                    )}
                    {(reportData.technicalContext.apparatus?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {reportData.technicalContext.apparatus.map((item) => (
                          <Badge key={item} variant="outline">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Mejora General</p>
                  <p className="text-2xl font-bold">
                    {reportData.overallImprovement > 0 ? "+" : ""}
                    {reportData.overallImprovement.toFixed(1)} puntos
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Áreas de Mejora</p>
                  <p className="text-2xl font-bold text-green-600">
                    {reportData.areasOfImprovement.length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Áreas de Preocupación</p>
                  <p className="text-2xl font-bold text-red-600">
                    {reportData.areasOfConcern.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {reportData.areasOfImprovement.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <TrendingUp className="h-5 w-5" />
                  Áreas de Mejora
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {reportData.areasOfImprovement.map((area, idx) => (
                    <Badge key={idx} variant="outline" className="bg-green-50">
                      {area}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {reportData.areasOfConcern.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <Target className="h-5 w-5" />
                  Áreas de Preocupación
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {reportData.areasOfConcern.map((area, idx) => (
                    <Badge key={idx} variant="outline" className="bg-red-50">
                      {area}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Progreso por Habilidad
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reportData.skills.map((skill) => (
                  <div key={skill.skillId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{skill.skillName}</p>
                        <p className="text-sm text-muted-foreground">
                          {skill.firstScore !== null && skill.lastScore !== null
                            ? `${skill.firstScore} → ${skill.lastScore}`
                            : "Sin datos"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {skill.trend === "improving" && (
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            Mejorando
                          </Badge>
                        )}
                        {skill.trend === "declining" && (
                          <Badge variant="outline" className="bg-red-50 text-red-700">
                            Declinando
                          </Badge>
                        )}
                        {skill.trend === "stable" && (
                          <Badge variant="outline" className="bg-gray-50">
                            Estable
                          </Badge>
                        )}
                        <span className="font-medium">
                          {skill.improvement > 0 ? "+" : ""}
                          {skill.improvement.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    {/* Gráfico simple de progreso */}
                    {skill.assessments.length > 1 && (
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(0, ((skill.lastScore || 0) / 10) * 100))}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
