"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DashboardData } from "@/lib/dashboard";
import { logger } from "@/lib/logger";

interface UseDashboardDataOptions {
  academyId: string;
  tenantId: string | null;
  initialData: DashboardData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDashboardData(value: unknown): value is DashboardData {
  if (!isRecord(value) || !isRecord(value.metrics) || !isRecord(value.plan)) return false;

  const metrics = value.metrics;
  const plan = value.plan;
  const requiredMetricKeys = [
    "athletes",
    "coaches",
    "groups",
    "classesThisWeek",
    "assessments",
    "attendancePercent",
  ];
  const requiredPlanNumberKeys = ["usedAthletes", "usedClasses", "athletePercent", "classPercent"];
  const validNullableLimit = (limit: unknown) => limit === null || isFiniteNumber(limit);

  return (
    requiredMetricKeys.every((key) => isFiniteNumber(metrics[key])) &&
    (metrics.classTemplates === undefined || isFiniteNumber(metrics.classTemplates)) &&
    typeof plan.planCode === "string" &&
    (plan.planNickname === null || typeof plan.planNickname === "string") &&
    typeof plan.status === "string" &&
    validNullableLimit(plan.athleteLimit) &&
    validNullableLimit(plan.classLimit) &&
    requiredPlanNumberKeys.every((key) => isFiniteNumber(plan[key])) &&
    Array.isArray(value.upcomingClasses) &&
    Array.isArray(value.recentActivity) &&
    Array.isArray(value.groups) &&
    Array.isArray(value.sportConfigBreakdown)
  );
}

export function useDashboardData({ academyId, tenantId, initialData }: UseDashboardDataOptions) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setData(initialData);
    setError(null);
  }, [initialData]);

  const refresh = useCallback(async () => {
    if (!academyId) {
      return;
    }

    // Cancelar petición anterior si existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Crear nuevo AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard/${academyId}`, {
        cache: "no-store",
        signal: abortController.signal,
      });

      // Si la petición fue cancelada, no hacer nada
      if (abortController.signal.aborted) {
        return;
      }

      if (!response.ok) {
        logger.error("Failed to fetch dashboard data", undefined, { status: response.status, statusText: response.statusText });
        setError("No se pudieron actualizar los datos del dashboard.");
        return;
      }

      const payload = (await response.json()) as unknown;
      const envelope = payload && typeof payload === "object"
        ? (payload as { ok?: unknown; data?: unknown })
        : null;
      const nextData = envelope?.data;

      if (envelope?.ok !== true || !isDashboardData(nextData)) {
        logger.error("Dashboard response payload is invalid", undefined, { academyId });
        setError("La respuesta del dashboard no tiene un formato válido.");
        return;
      }
      
      // Verificar nuevamente si fue cancelada antes de actualizar el estado
      if (!abortController.signal.aborted) {
        setData(nextData);
        setError(null);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "";
      // Ignorar errores de cancelación
      if ((error instanceof Error && error.name === "AbortError") || msg.includes("aborted")) {
        return;
      }
      logger.error("Error fetching dashboard data:", error);
      setError("No se pudieron actualizar los datos del dashboard.");
    } finally {
      // Solo actualizar loading si la petición no fue cancelada
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  }, [academyId]);

  useEffect(() => {
    if (!academyId) return;
    void refresh();

    // Cleanup: cancelar petición al desmontar o cambiar dependencias
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [academyId, refresh]);

  useEffect(() => {
    if (!academyId || !tenantId) return;

    let disposed = false;
    let cleanupChannel: (() => void) | undefined;
    const refreshTimers = new Set<ReturnType<typeof setTimeout>>();

    const setupRealtime = async () => {
      try {
        // Realtime es una mejora posterior al primer paint; no debe bloquear ni
        // inflar el chunk crítico del dashboard.
        const { createClient } = await import("@/lib/supabase/client");
        if (disposed) return;

        const supabase = createClient();
        const channel = supabase.channel(`dashboard:${academyId}`);

        const subscribe = (table: string, filter?: string) => {
          channel.on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table,
              filter,
            },
            () => {
              // Agrupar cambios próximos para evitar una petición por fila.
              const timer = setTimeout(() => {
                refreshTimers.delete(timer);
                if (!disposed) void refresh();
              }, 100);
              refreshTimers.add(timer);
            }
          );
        };

        subscribe("athletes", `academy_id=eq.${academyId}`);
        subscribe("coaches", `academy_id=eq.${academyId}`);
        subscribe("groups", `academy_id=eq.${academyId}`);
        subscribe("group_athletes", `tenant_id=eq.${tenantId}`);
        subscribe("classes", `academy_id=eq.${academyId}`);
        subscribe("class_sessions", `tenant_id=eq.${tenantId}`);
        subscribe("class_coach_assignments", `tenant_id=eq.${tenantId}`);
        subscribe("athlete_assessments", `academy_id=eq.${academyId}`);
        subscribe("audit_logs", `tenant_id=eq.${tenantId}`);
        // La API filtra las suscripciones por usuario/academia.
        subscribe("subscriptions");

        channel.subscribe();
        cleanupChannel = () => {
          void supabase.removeChannel(channel);
        };
      } catch (error) {
        if (!disposed) {
          logger.warn("Dashboard realtime unavailable", { error });
        }
      }
    };

    void setupRealtime();

    return () => {
      disposed = true;
      refreshTimers.forEach((timer) => clearTimeout(timer));
      refreshTimers.clear();
      cleanupChannel?.();
    };
  }, [academyId, tenantId, refresh]);

  return {
    data,
    refresh,
    loading,
    error,
  };
}
