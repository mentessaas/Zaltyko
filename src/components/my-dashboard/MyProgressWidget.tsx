"use client";

import { TrendingUp, Award, Target, Star, Medal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LineChart } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";

interface AthleteWithDetails {
  id: string;
  name: string;
  level: string | null;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  coachName: string | null;
}

interface AttendanceData {
  total: number;
  present: number;
  absent: number;
  excused: number;
  recentRecords: {
    date: string;
    status: string;
    className: string;
  }[];
}

interface MyProgressWidgetProps {
  athleteData: AthleteWithDetails | null;
  attendanceData: AttendanceData | null;
}

export function MyProgressWidget({
  athleteData,
  attendanceData,
}: MyProgressWidgetProps) {
  if (!athleteData) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Star className="h-10 w-10 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          Sin información del atleta
        </p>
        <p className="text-xs text-muted-foreground">
          Los datos de progreso aparecerán aquí
        </p>
      </div>
    );
  }

  // Calcular métricas
  const attendanceRate =
    attendanceData && attendanceData.total > 0
      ? Math.round((attendanceData.present / attendanceData.total) * 100)
      : 0;

  // Generar datos de tendencia (simulado con datos reales si existen)
  const trendData = generateTrendData(attendanceData);

  // Obtener nivel o habilidad
  const currentLevel = athleteData.level || "Principiante";

  // Definir progreso hacia el siguiente nivel
  const levelProgress = getLevelProgress(currentLevel);

  return (
    <div className="space-y-6">
      {/* Información del nivel actual */}
      <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
            <Award className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Nivel actual</p>
            <p className="text-lg font-semibold text-foreground">
              {currentLevel}
            </p>
          </div>
        </div>
        {athleteData.groupName && (
          <Badge
            variant="outline"
            className="text-sm"
            style={
              athleteData.groupColor
                ? {
                    borderColor: athleteData.groupColor,
                    color: athleteData.groupColor,
                    backgroundColor: `${athleteData.groupColor}10`,
                  }
                : undefined
            }
          >
            {athleteData.groupName}
          </Badge>
        )}
      </div>

      {/* Progreso hacia siguiente nivel */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Target className="h-4 w-4" />
            Progreso hacia siguiente nivel
          </span>
          <span className="font-medium text-foreground">
            {levelProgress.current} / {levelProgress.target}
          </span>
        </div>
        <Progress value={levelProgress.percentage} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {levelProgress.percentage >= 100
            ? "¡Has alcanzado el nivel máximo!"
            : `Completa ${levelProgress.target - levelProgress.current} clases más para avanzar`}
        </p>
      </div>

      {/* Estadísticas de rendimiento */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 text-center">
          <TrendingUp className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-1 text-2xl font-bold text-foreground">
            {attendanceRate}%
          </p>
          <p className="text-xs text-muted-foreground">Asistencia</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <Medal className="mx-auto h-6 w-6 text-amber-500" />
          <p className="mt-1 text-2xl font-bold text-foreground">
            {athleteData.coachName ? "1" : "0"}
          </p>
          <p className="text-xs text-muted-foreground">Entrenador</p>
        </div>
      </div>

      {/* Gráfico de tendencia de asistencia */}
      {trendData.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Evolución de asistencia
          </p>
          <LineChart data={trendData} height={120} showArea={true} />
        </div>
      )}

      {/* Habilidades o logros */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          Habilidades desbloqueadas
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-amber-50">
            <Star className="mr-1 h-3 w-3 text-amber-500" />
            Asistente
          </Badge>
          {attendanceRate >= 80 && (
            <Badge variant="outline" className="bg-emerald-50">
              <Medal className="mr-1 h-3 w-3 text-emerald-500" />
              Constante
            </Badge>
          )}
          {attendanceData && attendanceData.total >= 10 && (
            <Badge variant="outline" className="bg-red-50">
              <Award className="mr-1 h-3 w-3 text-red-500" />
              Veterano
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function generateTrendData(attendanceData: AttendanceData | null) {
  if (!attendanceData || attendanceData.recentRecords.length === 0) {
    // Generar datos de ejemplo
    return [
      { label: "Sem 1", value: 85 },
      { label: "Sem 2", value: 90 },
      { label: "Sem 3", value: 75 },
      { label: "Sem 4", value: 95 },
    ];
  }

  // Agrupar por semana los datos reales
  const weeks: Record<string, { present: number; total: number }> = {};

  attendanceData.recentRecords.forEach((record) => {
    const date = new Date(record.date);
    const week = Math.ceil(date.getDate() / 7);
    const weekKey = `Sem ${week}`;

    if (!weeks[weekKey]) {
      weeks[weekKey] = { present: 0, total: 0 };
    }

    weeks[weekKey].total++;
    if (record.status === "present") {
      weeks[weekKey].present++;
    }
  });

  return Object.entries(weeks).map(([label, data]) => ({
    label,
    value: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
  }));
}

function getLevelProgress(level: string | null) {
  // Simular progreso basado en nivel
  const levels: Record<string, { current: number; target: number }> = {
    "Principiante": { current: 8, target: 20 },
    "Intermedio": { current: 15, target: 30 },
    "Avanzado": { current: 25, target: 40 },
    "Élite": { current: 35, target: 50 },
    "Profesional": { current: 45, target: 60 },
  };

  const progress = levels[level || "Principiante"] || { current: 5, target: 20 };

  return {
    ...progress,
    percentage: Math.min(Math.round((progress.current / progress.target) * 100), 100),
  };
}
