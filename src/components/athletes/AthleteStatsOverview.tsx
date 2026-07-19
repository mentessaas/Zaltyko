"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  BookOpen,
  ClipboardCheck,
  FileText,
  TrendingUp,
  Calendar,
  Award,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AthleteStats } from "@/types/athletes";

interface AthleteStatsOverviewProps {
  athleteId: string;
  academyId: string;
  initialStats?: AthleteStats | null;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: number | null;
  progress?: number | null;
  color?: string;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  progress,
  color = "text-zaltyko-primary",
}: StatCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {progress !== null && progress !== undefined && (
          <Progress value={progress} className="mt-2 h-1.5" />
        )}
        {trend !== null && trend !== undefined && trend !== 0 && (
          <p
            className={`text-xs mt-1 ${
              trend > 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {trend > 0 ? "+" : ""}
            {trend}% vs. anterior
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function AthleteStatsOverview({
  athleteId,
  academyId,
  initialStats,
}: AthleteStatsOverviewProps) {
  const [stats, setStats] = useState<AthleteStats | null>(
    initialStats ?? null
  );
  const [loading, setLoading] = useState(!initialStats);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialStats) {
      setStats(initialStats);
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch athlete data and assessment stats in parallel
        const [athleteRes, assessmentsRes] = await Promise.all([
          fetch(`/api/athletes/${athleteId}?academyId=${academyId}`),
          fetch(`/api/assessments/${athleteId}?academyId=${academyId}`),
        ]);

        if (!athleteRes.ok) {
          throw new Error("No se pudieron cargar las estadísticas.");
        }

        const athleteData = await athleteRes.json();
        const assessmentsData = assessmentsRes.ok
          ? await assessmentsRes.json()
          : { items: [] };

        // Calculate stats from athlete data
        const athlete = athleteData.data;

        // Calculate average score from assessments
        const assessments = assessmentsData.items || [];
        let averageScore: number | null = null;
        let lastAssessmentDate: string | null = null;
        let lastAssessmentScore: number | null = null;

        if (assessments.length > 0) {
          const scores = assessments
            .map((a: { totalScore: string | null }) =>
              a.totalScore ? parseFloat(a.totalScore) : null
            )
            .filter((s: number | null): s is number => s !== null);

          if (scores.length > 0) {
            averageScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
            lastAssessmentScore = scores[0];
            const latestAssessment = assessments[0];
            if (latestAssessment?.assessmentDate) {
              lastAssessmentDate = format(
                new Date(latestAssessment.assessmentDate),
                "d MMM yyyy",
                { locale: es }
              );
            }
          }
        }

        const calculatedStats: AthleteStats = {
          totalClasses: athlete.classCount ?? 0,
          totalAssessments: athlete.assessmentCount ?? assessments.length,
          totalDocuments: athlete.documentCount ?? 0,
          attendanceRate: null, // Would need attendance data
          lastAssessmentDate,
          lastAssessmentScore,
          averageScore: averageScore
            ? Math.round(averageScore * 10) / 10
            : null,
          upcomingClasses: 0, // Would need schedule data
        };

        setStats(calculatedStats);
      } catch (err) {
        setError((err as Error).message ?? "Error al cargar las estadísticas.");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [athleteId, academyId, initialStats]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
              <div className="h-4 w-4 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-700">{error ?? "Error al cargar estadísticas."}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Clases Totales"
        value={stats.totalClasses}
        subtitle="Clases registradas"
        icon={BookOpen}
        color="text-blue-600"
      />
      <StatCard
        title="Evaluaciones"
        value={stats.totalAssessments}
        subtitle={
          stats.lastAssessmentDate
            ? `Última: ${stats.lastAssessmentDate}`
            : "Sin evaluaciones"
        }
        icon={ClipboardCheck}
        color="text-purple-600"
      />
      <StatCard
        title="Documentos"
        value={stats.totalDocuments}
        subtitle="Documentos cargados"
        icon={FileText}
        color="text-amber-600"
      />
      <StatCard
        title="Promedio General"
        value={
          stats.averageScore !== null
            ? `${stats.averageScore}/10`
            : "N/A"
        }
        subtitle={
          stats.lastAssessmentScore !== null
            ? `Última: ${stats.lastAssessmentScore}/10`
            : "Sin datos"
        }
        icon={Award}
        color="text-green-600"
      />
    </div>
  );
}
