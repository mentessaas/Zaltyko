"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DashboardData } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/client";

interface UseDashboardDataOptions {
  academyId: string;
  tenantId: string | null;
  initialData: DashboardData;
}

export function useDashboardData({ academyId, tenantId, initialData }: UseDashboardDataOptions) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<DashboardData>(initialData);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUserId(data.user?.id ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!academyId || !userId) {
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
        headers: {
          "x-user-id": userId,
        },
        cache: "no-store",
        signal: abortController.signal,
      });

      // Si la petición fue cancelada, no hacer nada
      if (abortController.signal.aborted) {
        return;
      }

      if (!response.ok) {
        console.error("Failed to fetch dashboard data:", response.status, response.statusText);
        return;
      }

      const payload = (await response.json()) as DashboardData;
      
      // Verificar nuevamente si fue cancelada antes de actualizar el estado
      if (!abortController.signal.aborted) {
        setData(payload);
      }
    } catch (error: any) {
      // Ignorar errores de cancelación
      if (error.name === "AbortError" || error.message?.includes("aborted")) {
        return;
      }
      // Ignorar errores de red suspendida (puede pasar durante hot reload)
      if (error.message?.includes("Failed to fetch") || error.message?.includes("ERR_NETWORK_IO_SUSPENDED")) {
        console.warn("Network request was suspended, likely due to hot reload");
        return;
      }
      console.error("Error fetching dashboard data:", error);
    } finally {
      // Solo actualizar loading si la petición no fue cancelada
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  }, [academyId, userId]);

  useEffect(() => {
    if (!academyId || !userId) return;
    refresh();

    // Cleanup: cancelar petición al desmontar o cambiar dependencias
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [academyId, userId]); // Removido refresh de dependencias para evitar loops

  useEffect(() => {
    if (!academyId || !tenantId) return;

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
          // Usar setTimeout para evitar múltiples refreshes simultáneos
          setTimeout(() => {
            refresh();
          }, 100);
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
    // Subscribe to all subscription changes (since we can't filter by academy owner easily)
    // The refresh will handle filtering correctly
    subscribe("subscriptions");

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [academyId, tenantId, supabase]); // Removido refresh de dependencias

  return {
    data,
    refresh,
    loading,
  };
}

