"use client";

import {
  Activity,
  Award,
  CalendarClock,
  ClipboardList,
  Target,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { LineChart } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { useAcademyContext } from "@/hooks/use-academy-context";

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

interface AssessmentData {
  id: string;
  assessmentDate: string;
  apparatus: string | null;
  overallComment: string | null;
  assessedByName: string | null;
}

interface MyProgressWidgetProps {
  athleteData: AthleteWithDetails | null;
  attendanceData: AttendanceData | null;
  assessmentsData: AssessmentData[];
}

export function MyProgressWidget({
  athleteData,
  attendanceData,
  assessmentsData,
}: MyProgressWidgetProps) {
  const { specialization } = useAcademyContext();

  if (!athleteData) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Award className="h-10 w-10 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          Sin información de {specialization.labels.athleteSingular.toLowerCase()}
        </p>
        <p className="text-xs text-muted-foreground">
          Los datos de progreso aparecerán aquí cuando haya actividad registrada.
        </p>
      </div>
    );
  }

  const attendanceRate =
    attendanceData && attendanceData.total > 0
      ? Math.round((attendanceData.present / attendanceData.total) * 100)
      : 0;
  const trendData = generateTrendData(attendanceData);
  const currentLevel = athleteData.level || "Por definir";
  const latestAssessment = assessmentsData[0] ?? null;
  const distinctApparatusCount = new Set(
    assessmentsData.map((assessment) => assessment.apparatus).filter(Boolean)
  ).size;
  const progressSnapshot = getProgressSnapshot({
    attendanceData,
    assessmentsCount: assessmentsData.length,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
            <Award className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {specialization.labels.levelLabel} actual
            </p>
            <p className="text-lg font-semibold text-foreground">{currentLevel}</p>
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

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Target className="h-4 w-4" />
            Señal de seguimiento reciente
          </span>
          <span className="font-medium text-foreground">
            {progressSnapshot.completed} / {progressSnapshot.total}
          </span>
        </div>
        <Progress value={progressSnapshot.percentage} className="h-2" />
        <p className="text-xs text-muted-foreground">{progressSnapshot.message}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 text-center">
          <TrendingUp className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-1 text-2xl font-bold text-foreground">
            {attendanceData ? `${attendanceRate}%` : "Sin datos"}
          </p>
          <p className="text-xs text-muted-foreground">Asistencia</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <ClipboardList className="mx-auto h-6 w-6 text-amber-500" />
          <p className="mt-1 text-2xl font-bold text-foreground">
            {assessmentsData.length}
          </p>
          <p className="text-xs text-muted-foreground">Evaluaciones registradas</p>
        </div>
      </div>

      {trendData.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Evolución de asistencia
          </p>
          <LineChart data={trendData} height={120} showArea={true} />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          Última referencia técnica
        </p>
        {latestAssessment ? (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-primary/5">
                <CalendarClock className="mr-1 h-3 w-3 text-primary" />
                {formatDate(latestAssessment.assessmentDate)}
              </Badge>
              {latestAssessment.apparatus && (
                <Badge variant="outline">
                  <Activity className="mr-1 h-3 w-3 text-primary" />
                  {latestAssessment.apparatus}
                </Badge>
              )}
              {distinctApparatusCount > 1 && (
                <Badge variant="outline">
                  {distinctApparatusCount} aparatos registrados
                </Badge>
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {latestAssessment.overallComment?.trim() ||
                "La última evaluación ya está registrada y disponible en el historial."}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            Todavía no hay evaluaciones registradas para mostrar una referencia técnica aquí.
          </div>
        )}
      </div>
    </div>
  );
}

function generateTrendData(attendanceData: AttendanceData | null) {
  if (!attendanceData || attendanceData.recentRecords.length === 0) {
    return [];
  }

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

function getProgressSnapshot({
  attendanceData,
  assessmentsCount,
}: {
  attendanceData: AttendanceData | null;
  assessmentsCount: number;
}) {
  const milestones = [
    Boolean(attendanceData && attendanceData.total >= 4),
    Boolean(attendanceData && attendanceData.present >= 3),
    Boolean(assessmentsCount >= 1),
    Boolean(assessmentsCount >= 3),
  ];
  const completed = milestones.filter(Boolean).length;
  const total = milestones.length;
  const percentage = Math.round((completed / total) * 100);

  let message = "Aún faltan registros para dibujar una evolución fiable.";
  if (assessmentsCount >= 3) {
    message =
      "Ya hay suficiente seguimiento para revisar evolución técnica y constancia.";
  } else if (assessmentsCount >= 1) {
    message =
      "Ya existe una evaluación registrada; conviene sumar más seguimiento para ver tendencia.";
  } else if (attendanceData && attendanceData.total >= 4) {
    message =
      "La asistencia ya empieza a dar contexto, pero aún faltan evaluaciones técnicas.";
  }

  return {
    completed,
    total,
    percentage,
    message,
  };
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}
