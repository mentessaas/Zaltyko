/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";

import { CHECKLIST_DEFINITIONS, type ChecklistKey } from "@/lib/onboarding-utils";
import { ITEM_ROUTES } from "@/lib/onboarding-routes";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { logger } from "@/lib/logger";

interface ChecklistItem {
  id: string;
  key: ChecklistKey;
  label: string;
  description: string | null;
  status: "pending" | "completed" | "skipped";
  completedAt: string | null;
}

interface ApiResponse {
  items: ChecklistItem[];
  summary?: {
    completed: number;
    total: number;
  };
}

interface ApiEnvelope {
  ok?: boolean;
  data?: ApiResponse;
}

interface OnboardingChecklistProps {
  academyId: string | null;
}

export { ITEM_ROUTES } from "@/lib/onboarding-routes";

export function OnboardingChecklist({ academyId }: OnboardingChecklistProps) {
  const toast = useToast();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingKey, setSubmittingKey] = useState<ChecklistKey | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const fetchChecklist = useCallback(async () => {
    if (!academyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/onboarding/checklist?academyId=${academyId}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as ApiEnvelope;
      if (!response.ok || !json.data) {
        throw new Error("Respuesta inválida del checklist");
      }
      setData(json.data);
    } catch (error) {
      logger.error("Error", error);
      toast.pushToast({
        title: "Error cargando checklist",
        description: "No se pudo obtener el estado del onboarding.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    fetchChecklist();
  }, [fetchChecklist]);

  const handleManualCompletion = async (key: ChecklistKey) => {
    if (!academyId) return;
    setSubmittingKey(key);
    try {
      const response = await fetch("/api/onboarding/checklist/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId, key, status: "completed" }),
      });
      if (!response.ok) {
        throw new Error("No se pudo actualizar el estado");
      }
      await fetchChecklist();
      toast.pushToast({
        title: "Paso completado",
        description: "Actualizamos el estado del checklist.",
      });
    } catch (error) {
      logger.error("Error", error);
      toast.pushToast({
        title: "Error",
        description: "No se pudo marcar el paso como completado.",
        variant: "error",
      });
    } finally {
      setSubmittingKey(null);
    }
  };

  const progressPercentage = useMemo(() => {
    if (!data?.summary) return 0;
    if (data.summary.total === 0) return 0;
    return Math.round((data.summary.completed / data.summary.total) * 100);
  }, [data]);

  if (!academyId) {
    return null;
  }

  return (
    <div
      className="space-y-4 rounded-2xl border border-dashed border-muted bg-card/60 p-6 shadow-sm"
      aria-busy={loading}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checklist</p>
          <h2 className="text-xl font-semibold">Pon tu academia en marcha</h2>
          <p className="text-sm text-foreground">
            Configura lo esencial y registra tu primera asistencia con una ruta clara, paso a paso.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm font-medium text-foreground">
            {data?.summary ? `${data.summary.completed}/${data.summary.total} completados` : "—"}
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-center rounded-md p-2 text-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={isExpanded ? "Ocultar pasos" : "Mostrar pasos"}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Progress value={progressPercentage} />
        <p className="text-xs text-muted-foreground">{progressPercentage}% completado</p>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {(data?.items ?? CHECKLIST_DEFINITIONS.map(item => ({ ...item, status: "pending" as const, completedAt: null, id: item.key }))).map((item) => {
            const route = ITEM_ROUTES[item.key];
            const isCompleted = item.status === "completed";
            return (
              <div
                key={item.key}
                className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${isCompleted ? "border-emerald-200 bg-emerald-50/80" : "border-border bg-background/70"
                  }`}
              >
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {route && (
                    <Button variant={isCompleted ? "secondary" : "default"} size="sm" asChild>
                      <Link href={route.href(academyId)}>{route.cta}</Link>
                    </Button>
                  )}
                  {route?.allowManualCompletion && !isCompleted && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleManualCompletion(item.key)}
                      disabled={submittingKey === item.key}
                    >
                      {submittingKey === item.key ? "Guardando..." : "Marcar como hecho"}
                    </Button>
                  )}
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                      }`}
                  >
                    {isCompleted ? "Completado" : "Pendiente"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
