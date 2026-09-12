import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EventLogEntry, SuperAdminMetrics } from "@/lib/superAdminService";
import { isSuperAdminMetrics, normalizeSuperAdminMetrics } from "@/lib/super-admin-metrics";
import { createClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";

export function useSuperAdminData(initial: SuperAdminMetrics, initialEvents: EventLogEntry[] = [], initialUserId?: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [metrics, setMetrics] = useState<SuperAdminMetrics>(() => normalizeSuperAdminMetrics(initial));
  const [events, setEvents] = useState<EventLogEntry[]>(initialEvents);
  const [userId, setUserId] = useState<string | null>(initialUserId ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMetrics(normalizeSuperAdminMetrics(initial));
    setEvents(initialEvents);
  }, [initial, initialEvents]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUserId(data.user?.id ?? initialUserId ?? null);
      }
    });
    return () => {
      mounted = false;
    };
  }, [supabase, initialUserId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
    setLoading(true);

    const failures: string[] = [];
    let metricsUpdated = false;
    let eventsUpdated = false;

    try {
      const [metricsResponse, eventsResponse] = await Promise.all([
        fetch("/api/super-admin/metrics", { cache: "no-store" }),
        fetch("/api/super-admin/events?limit=50", { cache: "no-store" }),
      ]);

      if (!metricsResponse.ok) {
        failures.push(`métricas (HTTP ${metricsResponse.status})`);
      } else {
        const json = await metricsResponse.json().catch(() => null);
        const unwrapped = json?.ok ? json.data : json;
        if (isSuperAdminMetrics(unwrapped)) {
          setMetrics(normalizeSuperAdminMetrics(unwrapped));
          metricsUpdated = true;
        } else {
          failures.push("métricas (respuesta inválida)");
          logger.warn("[useSuperAdminData] Invalid metrics payload from API:", unwrapped);
        }
      }

      if (!eventsResponse.ok) {
        failures.push(`actividad (HTTP ${eventsResponse.status})`);
      } else {
        const json = await eventsResponse.json().catch(() => null);
        const unwrapped = json?.ok ? json.data : json;
        if (Array.isArray(unwrapped)) {
          setEvents(unwrapped);
          eventsUpdated = true;
        } else {
          failures.push("actividad (respuesta inválida)");
        }
      }

      setLastUpdatedAt(metricsUpdated || eventsUpdated ? new Date() : null);
      setError(
        failures.length > 0
          ? `No se pudo sincronizar ${failures.join(" y ")}. Los datos anteriores siguen visibles.`
          : null
      );
    } catch (err) {
      logger.error("[useSuperAdminData] Failed to refresh metrics and activity:", err);
      setError("No se pudo conectar con el control plane. Los datos anteriores siguen visibles.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
  }, [userId, refresh]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 400);
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("super-admin:global");

    const listen = (table: string) => {
      channel.on(
        "postgres_changes",
        { schema: "public", table, event: "*" },
        scheduleRefresh
      );
    };

    listen("academies");
    listen("profiles");
    listen("subscriptions");
    listen("plans");
    listen("billing_invoices");
    listen("charges");
    listen("athletes");
    listen("groups");
    listen("athlete_assessments");
    listen("event_logs");

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setError("La actualización en tiempo real no está disponible. Usa Refrescar para consultar los datos.");
      }
    });

    return () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [userId, supabase, scheduleRefresh]);

  return {
    metrics,
    events,
    refresh,
    loading,
    error,
    lastUpdatedAt,
  };
}
