"use client";

import { useState, useEffect } from "react";
import { Users, AlertTriangle, TrendingDown, Calendar, ChevronRight, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface AtRiskAthlete {
  athleteId: string;
  athleteName: string;
  athleteStatus: string;
  totalClasses: number;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
  lastAttendance: Date | null;
  daysSinceLastAttendance: number;
  riskScore: number;
  riskLevel: "high" | "medium" | "low";
}

interface AttendanceRiskWidgetProps {
  academyId: string;
}

export function AttendanceRiskWidget({ academyId }: AttendanceRiskWidgetProps) {
  const [athletes, setAthletes] = useState<AtRiskAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    avgAttendance: number;
  } | null>(null);

  useEffect(() => {
    loadAtRiskAthletes();
  }, [academyId]);

  const loadAtRiskAthletes = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/ai/attendance/risk-analysis?academyId=${academyId}`);
      if (response.ok) {
        const data = await response.json();
        setAthletes(data.athletes || []);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Error loading at-risk athletes:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (level: "high" | "medium" | "low") => {
    switch (level) {
      case "high":
        return "text-red-600 bg-red-50";
      case "medium":
        return "text-amber-600 bg-amber-50";
      case "low":
        return "text-emerald-600 bg-emerald-50";
    }
  };

  const getRiskBarColor = (level: "high" | "medium" | "low") => {
    switch (level) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-amber-500";
      case "low":
        return "bg-emerald-500";
    }
  };

  const getAttendanceColor = (rate: number) => {
    if (rate >= 85) return "text-emerald-600";
    if (rate >= 70) return "text-amber-600";
    return "text-red-600";
  };

  const getRecommendation = (athlete: AtRiskAthlete): string => {
    if (athlete.riskLevel === "high") {
      return "Contactar familia urgentemente";
    }
    if (athlete.riskLevel === "medium") {
      return "Enviar recordatorio de clases";
    }
    return "Mantener seguimiento";
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-red-200/50 bg-gradient-to-br from-red-50/30 via-white to-red-50/30 p-6 shadow-lg shadow-red-500/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/20">
            <TrendingDown className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-red-600/80">
              Riesgo de abandono
            </p>
            <h3 className="text-lg font-bold text-zaltyko-text-main">
              Cargando...
            </h3>
          </div>
        </div>
      </div>
    );
  }

  if (athletes.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/30 via-white to-emerald-50/30 p-6 shadow-lg shadow-emerald-500/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <TrendingDown className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600/80">
              Riesgo de abandono
            </p>
            <h3 className="text-lg font-bold text-zaltyko-text-main">
              Asistencia saludable
            </h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          No hay atletas en riesgo de abandono actualmente.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-200/50 bg-gradient-to-br from-red-50/30 via-white to-red-50/30 p-6 shadow-lg shadow-red-500/10">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/20">
            <TrendingDown className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-red-600/80">
              Riesgo de abandono
            </p>
            <h3 className="text-lg font-bold text-zaltyko-text-main">
              {athletes.length} {athletes.length === 1 ? "atleta en riesgo" : "atletas en riesgo"}
            </h3>
          </div>
        </div>
        {summary && (
          <div className="flex gap-2">
            {summary.highRisk > 0 && (
              <Badge variant="error" className="text-xs">
                {summary.highRisk} alto
              </Badge>
            )}
            {summary.mediumRisk > 0 && (
              <Badge className="bg-amber-100 text-amber-700 text-xs">
                {summary.mediumRisk} medio
              </Badge>
            )}
          </div>
        )}
      </header>

      {summary && (
        <div className="mb-4 p-3 rounded-lg bg-red-50/50 border border-red-200/30">
          <div className="flex items-center justify-between text-sm">
            <span className="text-red-700">Asistencia promedio</span>
            <span className={cn("font-semibold", getAttendanceColor(summary.avgAttendance))}>
              {summary.avgAttendance}%
            </span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {athletes.slice(0, 5).map((athlete) => (
          <div
            key={athlete.athleteId}
            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/60 border border-red-100/50 hover:bg-white/80 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm text-zaltyko-text-main truncate">
                  {athlete.athleteName}
                </p>
                <Badge className={cn("text-xs shrink-0", getRiskColor(athlete.riskLevel))} variant="outline">
                  {athlete.riskScore}%
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className={getAttendanceColor(athlete.attendanceRate)}>
                  {athlete.attendanceRate}% asistencia
                </span>
                <span>·</span>
                <span>{athlete.absentCount} ausencias</span>
                <span>·</span>
                <span>
                  {athlete.daysSinceLastAttendance === 999
                    ? "Sin registros"
                    : `${athlete.daysSinceLastAttendance}d sin asistir`}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Progress
                  value={athlete.attendanceRate}
                  className="h-1.5 flex-1"
                  indicatorClassName={getRiskBarColor(athlete.riskLevel)}
                />
                <span className="text-xs text-muted-foreground shrink-0">
                  {getRecommendation(athlete)}
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-8 gap-1"
            >
              <MessageSquare className="h-3 w-3" />
              <span className="hidden sm:inline">Contactar</span>
            </Button>
          </div>
        ))}
      </div>

      {athletes.length > 5 && (
        <div className="mt-4 pt-3 border-t border-red-200/30">
          <Button variant="ghost" size="sm" className="w-full text-red-700 hover:text-red-800">
            Ver todos los {athletes.length} atletas
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
