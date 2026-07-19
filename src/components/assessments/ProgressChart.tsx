"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AssessmentWithScores, ProgressData } from "@/types";

interface ProgressChartProps {
  assessments: AssessmentWithScores[];
  athleteName: string;
}

type ChartType = "line" | "area";
type TimeRange = "3m" | "6m" | "1y" | "all";

export function ProgressChart({ assessments, athleteName }: ProgressChartProps) {
  const [chartType, setChartType] = useState<ChartType>("line");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(["all"]);

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

  // Preparar datos para el gráfico
  const chartData = useMemo(() => {
    // Agrupar por fecha
    const dataByDate: Record<string, Record<string, number | string>> = {};

    filteredAssessments
      .sort((a, b) => new Date(a.assessmentDate).getTime() - new Date(b.assessmentDate).getTime())
      .forEach((assessment) => {
        const dateKey = format(new Date(assessment.assessmentDate), "dd MMM");
        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = { date: dateKey, fullDate: assessment.assessmentDate };
        }

        assessment.scores.forEach((score) => {
          if (selectedSkills.includes("all") || selectedSkills.includes(score.skillName)) {
            // Usar promedio si ya existe
            if (dataByDate[dateKey][score.skillName]) {
              const current = dataByDate[dateKey][score.skillName] as number;
              dataByDate[dateKey][score.skillName] = (current + score.score) / 2;
            } else {
              dataByDate[dateKey][score.skillName] = score.score;
            }
          }
        });

        // Calcular promedio general
        const scores = assessment.scores.map((s) => s.score);
        if (scores.length > 0) {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          if (selectedSkills.includes("all")) {
            dataByDate[dateKey].promedio = avg;
          }
        }
      });

    return Object.values(dataByDate);
  }, [filteredAssessments, selectedSkills]);

  // Colores para cada skill
  const colors = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#84cc16", // lime
  ];

  if (assessments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No hay datos para mostrar</p>
        </CardContent>
      </Card>
    );
  }

  const renderChart = () => {
    const skillsToShow = selectedSkills.includes("all")
      ? ["promedio"]
      : selectedSkills.filter((s) => s !== "all");

    const ChartComponent = chartType === "area" ? AreaChart : LineChart;

    return (
      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => value}
            className="text-muted-foreground"
          />
          <YAxis
            domain={[0, 10]}
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
            label={{
              value: "Puntuación",
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle", fontSize: 12 },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
            }}
            labelFormatter={(label) => {
              const item = chartData.find((d) => d.date === label);
              return item ? format(new Date(item.fullDate as string), "PPP", { locale: es }) : label;
            }}
          />
          <Legend />
          {skillsToShow.map((skill, index) => (
            <Line
              key={skill}
              type="monotone"
              dataKey={skill}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={{ fill: colors[index % colors.length], strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          ))}
          {chartType === "area" &&
            skillsToShow.map((skill, index) => (
              <Area
                key={`${skill}-area`}
                type="monotone"
                dataKey={skill}
                stroke="transparent"
                fill={colors[index % colors.length]}
                fillOpacity={0.1}
              />
            ))}
        </ChartComponent>
      </ResponsiveContainer>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Gráfico de Progreso</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="line">Línea</SelectItem>
                <SelectItem value="area">Área</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={(v: string) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo</SelectItem>
                <SelectItem value="3m">3 meses</SelectItem>
                <SelectItem value="6m">6 meses</SelectItem>
                <SelectItem value="1y">1 año</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No hay datos para el período seleccionado
          </div>
        ) : (
          renderChart()
        )}
      </CardContent>
    </Card>
  );
}
