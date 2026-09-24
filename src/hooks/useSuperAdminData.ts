import { useCallback, useEffect, useMemo, useState } from "react";

import type { SuperAdminMetrics } from "@/lib/superAdminService";
import { isSuperAdminMetrics, normalizeSuperAdminMetrics } from "@/lib/super-admin-metrics";
import { createClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";

const SUPER_ADMIN_REFRESH_TIMEOUT_MS = 10_000;

export function useSuperAdminData(initial: SuperAdminMetrics) {
  const supabase = useMemo(() => createClient(), []);
  const [metrics, setMetrics] = useState<SuperAdminMetrics>(() => normalizeSuperAdminMetrics(initial));
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    setMetrics(normalizeSuperAdminMetrics(initial));
  }, [initial]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUserId(data.user?.id ?? null);
      }
    });
    return () => {
      mounted = false;
    };
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setRefreshError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SUPER_ADMIN_REFRESH_TIMEOUT_MS);

    try {
      const response = await fetch("/api/super-admin/metrics", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        setRefreshError("No se pudieron actualizar las métricas. Mostramos el último corte válido.");
        return;
      }
      const json = await response.json();
      const unwrapped = json.ok ? json.data : json;
      if (isSuperAdminMetrics(unwrapped)) {
        setMetrics(normalizeSuperAdminMetrics(unwrapped));
      } else {
        setRefreshError("La respuesta de métricas no es válida. Mostramos el último corte válido.");
        logger.warn("[useSuperAdminData] Invalid metrics payload from API:", unwrapped);
      }
    } catch (err) {
      const message = controller.signal.aborted
        ? "La actualización tardó demasiado. Mostramos el último corte válido."
        : "No se pudieron actualizar las métricas. Mostramos el último corte válido.";
      setRefreshError(message);
      logger.error("[useSuperAdminData] Failed to refresh metrics:", err);
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("super-admin:global");

    const listen = (table: string) => {
      channel.on(
        "postgres_changes",
        { schema: "public", table, event: "*" },
        () => {
          refresh();
        }
      );
    };

    listen("academies");
    listen("profiles");
    listen("subscriptions");
    listen("plans");
    listen("billing_invoices");
    listen("athlete_assessments");

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase, refresh]);

  return {
    metrics,
    refresh,
    loading,
    refreshError,
  };
}
