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

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isDashboardMetrics(value: unknown): value is DashboardData["metrics"] {
  if (!isRecord(value)) return false;

  return (
    ["athletes", "coaches", "groups", "classesThisWeek", "assessments", "attendancePercent"]
      .every((key) => isFiniteNumber(value[key])) &&
    (value.classTemplates === undefined || isFiniteNumber(value.classTemplates))
  );
}

function isDashboardPlan(value: unknown): value is DashboardData["plan"] {
  if (!isRecord(value)) return false;

  const validNullableLimit = (limit: unknown) => limit === null || isFiniteNumber(limit);

  return (
    typeof value.planCode === "string" &&
    isStringOrNull(value.planNickname) &&
    typeof value.status === "string" &&
    validNullableLimit(value.athleteLimit) &&
    validNullableLimit(value.classLimit) &&
    ["usedAthletes", "usedClasses", "athletePercent", "classPercent"]
      .every((key) => isFiniteNumber(value[key]))
  );
}

function isUpcomingClass(value: unknown): value is DashboardData["upcomingClasses"][number] {
  if (!isRecord(value) || !Array.isArray(value.coaches)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.classId === "string" &&
    isStringOrNull(value.className) &&
    typeof value.sessionDate === "string" &&
    isStringOrNull(value.startTime) &&
    isStringOrNull(value.endTime) &&
    value.coaches.every((coach) =>
      isRecord(coach) && typeof coach.id === "string" && isStringOrNull(coach.name)
    ) &&
    isStringOrNull(value.groupName) &&
    isStringOrNull(value.groupColor) &&
    (value.isSessionPlaceholder === undefined || typeof value.isSessionPlaceholder === "boolean")
  );
}

function parseDashboardActivity(value: unknown): DashboardData["recentActivity"][number] | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.action !== "string" ||
    typeof value.description !== "string" ||
    !isStringOrNull(value.userName)
  ) {
    return null;
  }

  const createdAt = value.createdAt instanceof Date
    ? value.createdAt
    : typeof value.createdAt === "string"
      ? new Date(value.createdAt)
      : null;

  if (!createdAt || !Number.isFinite(createdAt.getTime())) return null;

  return { id: value.id, action: value.action, description: value.description, createdAt, userName: value.userName };
}

function isDashboardGroup(value: unknown): value is DashboardData["groups"][number] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.discipline === "string" &&
    isStringOrNull(value.color) &&
    isStringOrNull(value.coachName) &&
    isFiniteNumber(value.athleteCount)
  );
}

function isSportConfigBreakdown(value: unknown): value is DashboardData["sportConfigBreakdown"][number] {
  return (
    isRecord(value) &&
    typeof value.sportConfigId === "string" &&
    typeof value.label === "string" &&
    typeof value.disciplineName === "string" &&
    typeof value.branchName === "string" &&
    isFiniteNumber(value.athletes) &&
    isFiniteNumber(value.groups) &&
    isFiniteNumber(value.classes)
  );
}

function isGrMetrics(value: unknown): value is NonNullable<DashboardData["grMetrics"]> {
  if (!isRecord(value) || !Array.isArray(value.athletesByCategory) || !Array.isArray(value.expiringLicenses) || !Array.isArray(value.upcomingCompetitions)) {
    return false;
  }

  return (
    value.athletesByCategory.every((item) => isRecord(item) && typeof item.category === "string" && isFiniteNumber(item.count)) &&
    value.expiringLicenses.every((item) =>
      isRecord(item) &&
      typeof item.id === "string" &&
      typeof item.personId === "string" &&
      isStringOrNull(item.personName) &&
      typeof item.licenseType === "string" &&
      typeof item.federation === "string" &&
      typeof item.validUntil === "string" &&
      isFiniteNumber(item.daysUntilExpiry)
    ) &&
    value.upcomingCompetitions.every((item) =>
      isRecord(item) &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      typeof item.startDate === "string" &&
      typeof item.level === "string" &&
      typeof item.status === "string"
    ) &&
    ["expiringLicensesThisWeek", "expiringLicensesThisMonth", "assessmentsThisMonth", "totalAthletesWithActiveLicense"]
      .every((key) => isFiniteNumber(value[key]))
  );
}

function parseDashboardData(value: unknown): DashboardData | null {
  if (
    !isRecord(value) ||
    !isDashboardMetrics(value.metrics) ||
    !isDashboardPlan(value.plan) ||
    !Array.isArray(value.upcomingClasses) ||
    !value.upcomingClasses.every(isUpcomingClass) ||
    !Array.isArray(value.recentActivity) ||
    !Array.isArray(value.groups) ||
    !value.groups.every(isDashboardGroup) ||
    !Array.isArray(value.sportConfigBreakdown) ||
    !value.sportConfigBreakdown.every(isSportConfigBreakdown) ||
    (value.grMetrics !== undefined && !isGrMetrics(value.grMetrics))
  ) {
    return null;
  }

  const recentActivity = value.recentActivity.map(parseDashboardActivity);
  if (recentActivity.some((item) => item === null)) return null;

  return {
    metrics: value.metrics,
    plan: value.plan,
    upcomingClasses: value.upcomingClasses,
    recentActivity: recentActivity as DashboardData["recentActivity"],
    groups: value.groups,
    sportConfigBreakdown: value.sportConfigBreakdown,
    ...(value.grMetrics === undefined ? {} : { grMetrics: value.grMetrics }),
  };
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
      const nextData = parseDashboardData(envelope?.data);

      if (envelope?.ok !== true || !nextData) {
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
