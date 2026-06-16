"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { TrendingUp, TrendingDown, Minus, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AssessmentWithScores, ProgressData, AssessmentType } from "@/types";

interface ProgressComparisonProps {
  assessments: AssessmentWithScores[];
  athleteName: string;
}

type ViewMode = "chart" | "table";

export function ProgressComparison({ assessments, athleteName }: ProgressComparisonProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("chart");
  const [selectedSkill, setSelectedSkill] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<"3m" | "6m" | "1y" | "all">("all");

  // Obtener todos los skills únicos
  const allSkills = useMemo(() => {
    const skills = new Set<string>();
    assessments.forEach((a) => {
      a.scores.forEach((s) => skills.add(s.skillName));
    });
    return Array.from(skills).sort();
  }, [assessments]);

  // Filtrar evaluaciones por rango de tiempo
  const filteredAssessments = useMemo(() => {
    const now = new Date();
    let cutoffDate: Date | null = null;

    switch (timeRange) {
      case "3m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 3));
        break;
      case "6m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 6));
        break;
      case "1y":
        cutoffDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        cutoffDate = null;
    }

    return cutoffDate
      ? assessments.filter((a) => new Date(a.assessmentDate) >= cutoffDate!)
      : assessments;
  }, [assessments, timeRange]);

  // Calcular progreso por skill
  const progressBySkill = useMemo(() => {
    const progress: Record<string, ProgressData[]> = {};

    filteredAssessments.forEach((assessment) => {
      assessment.scores.forEach((score) => {
        if (selectedSkill === "all" || score.skillName === selectedSkill) {
          if (!progress[score.skillName]) {
            progress[score.skillName] = [];
          }
          progress[score.skillName].push({
            date: assessment.assessmentDate,
            score: score.score,
            assessmentId: assessment.id,
          });
        }
      });
    });

    // Ordenar por fecha
    Object.keys(progress).forEach((skill) => {
      progress[skill].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });

    return progress;
  }, [filteredAssessments, selectedSkill]);

  // Calcular tendencia general
  const overallTrend = useMemo(() => {
    const trends: ("improving" | "declining" | "stable")[] = [];

    Object.values(progressBySkill).forEach((data) => {
      if (data.length >= 2) {
        const first = data[0].score;
        const last = data[data.length - 1].score;
        const diff = last - first;
        if (diff > 1) trends.push("improving");
        else if (diff < -1) trends.push("declining");
        else trends.push("stable");
      }
    });

    if (trends.length === 0) return "stable";
    const improvingCount = trends.filter((t) => t === "improving").length;
    const decliningCount = trends.filter((t) => t === "declining").length;

    if (improvingCount > decliningCount) return "improving";
    if (decliningCount > improvingCount) return "declining";
    return "stable";
  }, [progressBySkill]);

  const trendIcon = {
    improving: <TrendingUp className="h-5 w-5 text-green-500" />,
    declining: <TrendingDown className="h-5 w-5 text-red-500" />,
    stable: <Minus className="h-5 w-5 text-gray-500" />,
  };

  const trendLabel = {
    improving: "Mejorando",
    declining: "Necesita atención",
    stable: "Estable",
  };

  // Calcular promedio general
  const averageScore = useMemo(() => {
    const allScores = filteredAssessments.flatMap((a) => a.scores.map((s) => s.score));
    if (allScores.length === 0) return 0;
    return allScores.reduce((a, b) => a + b, 0) / allScores.length;
  }, [filteredAssessments]);

  if (assessments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Sin datos de progreso</h3>
          <p className="text-sm text-muted-foreground">
            {athleteName} necesita al menos 2 evaluaciones para ver el progreso
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con controles */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {trendIcon[overallTrend]}
          <span className="font-medium">{trendLabel[overallTrend]}</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedSkill} onValueChange={setSelectedSkill}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Skill" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los skills</SelectItem>
              {allSkills.map((skill) => (
                <SelectItem key={skill} value={skill}>
                  {skill}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={(v: string) => setTimeRange(v as "3m" | "6m" | "1y" | "all")}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo</SelectItem>
              <SelectItem value="3m">Últimos 3 meses</SelectItem>
              <SelectItem value="6m">Últimos 6 meses</SelectItem>
              <SelectItem value="1y">Último año</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resumen stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Evaluaciones</p>
            <p className="text-2xl font-bold">{filteredAssessments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Promedio</p>
            <p className="text-2xl font-bold">{averageScore.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Mejor score</p>
            <p className="text-2xl font-bold">
              {Math.max(...filteredAssessments.flatMap((a) => a.scores.map((s) => s.score)), 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Skills evaluados</p>
            <p className="text-2xl font-bold">{Object.keys(progressBySkill).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Vista de tabla */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Historial de Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium">Fecha</th>
                  <th className="text-left py-2 px-2 font-medium">Tipo</th>
                  <th className="text-right py-2 px-2 font-medium">Score</th>
                  <th className="text-right py-2 px-2 font-medium">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssessments
                  .sort((a, b) => new Date(b.assessmentDate).getTime() - new Date(a.assessmentDate).getTime())
                  .map((assessment, index, arr) => {
                    const prevAssessment = arr[index + 1];
                    const currentAvg = assessment.averageScore ?? 0;
                    const prevAvg = prevAssessment?.averageScore ?? null;
                    const diff = prevAvg !== null ? currentAvg - prevAvg : null;

                    return (
                      <tr key={assessment.id} className="border-b last:border-0">
                        <td className="py-2 px-2">
                          {format(new Date(assessment.assessmentDate), "dd MMM yyyy", { locale: es })}
                        </td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className="text-xs">
                            {assessment.assessmentType}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-right font-medium">{currentAvg.toFixed(1)}</td>
                        <td className="py-2 px-2 text-right">
                          {diff !== null && (
                            <span
                              className={cn(
                                "flex items-center justify-end gap-1 text-xs",
                                diff > 0 && "text-green-600",
                                diff < 0 && "text-red-600",
                                diff === 0 && "text-gray-500"
                              )}
                            >
                              {diff > 0 ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                              {Math.abs(diff).toFixed(1)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Información adicional */}
      <Card>
        <CardContent className="p-4">
          <h4 className="font-medium mb-2">Análisis de Progreso</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            {Object.entries(progressBySkill).map(([skill, data]) => {
              if (data.length < 2) return null;
              const first = data[0].score;
              const last = data[data.length - 1].score;
              const improvement = last - first;

              return (
                <div key={skill} className="flex items-center justify-between">
                  <span>{skill}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{first} → {last}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        improvement > 0 && "bg-green-50 text-green-700 border-green-200",
                        improvement < 0 && "bg-red-50 text-red-700 border-red-200",
                        improvement === 0 && "bg-gray-50 text-gray-700 border-gray-200"
                      )}
                    >
                      {improvement > 0 ? "+" : ""}{improvement}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
