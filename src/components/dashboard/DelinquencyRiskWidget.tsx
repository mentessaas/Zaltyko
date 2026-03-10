"use client";

import { useState, useEffect } from "react";
import { CreditCard, AlertTriangle, TrendingUp, Users, ChevronRight, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface AtRiskAthlete {
  athleteId: string;
  athleteName: string;
  athleteStatus: string;
  parentName: string | null;
  parentEmail: string | null;
  pendingCharges: Array<{
    id: string;
    amount: number;
    period: string;
    dueDate: string | null;
    status: string;
  }>;
  totalPending: number;
  oldestPendingDays: number;
  riskScore: number;
  riskLevel: "high" | "medium" | "low";
  totalPendingFormatted: string;
}

interface DelinquencyRiskWidgetProps {
  academyId: string;
}

export function DelinquencyRiskWidget({ academyId }: DelinquencyRiskWidgetProps) {
  const [athletes, setAthletes] = useState<AtRiskAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    totalPending: number;
  } | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState<AtRiskAthlete | null>(null);
  const [generatingReminder, setGeneratingReminder] = useState(false);

  useEffect(() => {
    loadAtRiskAthletes();
  }, [academyId]);

  const loadAtRiskAthletes = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/ai/billing/at-risk-athletes?academyId=${academyId}`);
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

  const generateReminder = async (athlete: AtRiskAthlete) => {
    setGeneratingReminder(true);
    try {
      const response = await fetch("/api/ai/billing/generate-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: athlete.athleteId,
          name: athlete.athleteName,
          pendingAmount: athlete.totalPendingFormatted,
          dueDate: athlete.pendingCharges[0]?.dueDate || new Date().toISOString(),
          academyName: "Academia", // TODO: Get actual academy name
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Show success or open reminder dialog
        alert(`Recordatorio generado para ${athlete.athleteName}:\n\n${data.message}`);
      }
    } catch (error) {
      console.error("Error generating reminder:", error);
    } finally {
      setGeneratingReminder(false);
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

  if (loading) {
    return (
      <div className="rounded-2xl border border-amber-200/50 bg-gradient-to-br from-amber-50/30 via-white to-amber-50/30 p-6 shadow-lg shadow-amber-500/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-600/80">
              Riesgo de morosidad
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
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600/80">
              Riesgo de morosidad
            </p>
            <h3 className="text-lg font-bold text-zaltyko-text-main">
              Sin atletas en riesgo
            </h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          No hay cargos pendientes actualmente.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200/50 bg-gradient-to-br from-amber-50/30 via-white to-amber-50/30 p-6 shadow-lg shadow-amber-500/10">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-600/80">
              Riesgo de morosidad
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
        <div className="mb-4 p-3 rounded-lg bg-amber-50/50 border border-amber-200/30">
          <p className="text-xs text-amber-700">
            <span className="font-semibold">Total pendiente:</span>{" "}
            €{(summary.totalPending / 100).toFixed(2)}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {athletes.slice(0, 5).map((athlete) => (
          <div
            key={athlete.athleteId}
            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/60 border border-amber-100/50 hover:bg-white/80 transition-colors"
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
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{athlete.totalPendingFormatted}</span>
                <span>·</span>
                <span>{athlete.oldestPendingDays} días</span>
              </div>
              <Progress
                value={athlete.riskScore}
                className="mt-2 h-1.5"
                indicatorClassName={getRiskBarColor(athlete.riskLevel)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-8 gap-1"
              onClick={() => generateReminder(athlete)}
              disabled={generatingReminder}
            >
              <Send className="h-3 w-3" />
              <span className="hidden sm:inline">Recordatorio</span>
            </Button>
          </div>
        ))}
      </div>

      {athletes.length > 5 && (
        <div className="mt-4 pt-3 border-t border-amber-200/30">
          <Button variant="ghost" size="sm" className="w-full text-amber-700 hover:text-amber-800">
            Ver todos los {athletes.length} atletas
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
