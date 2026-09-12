import { useCallback, useEffect, useMemo, useState } from "react";

import type { EventLogEntry, SuperAdminMetrics } from "@/lib/superAdminService";
import { isSuperAdminMetrics, normalizeSuperAdminMetrics } from "@/lib/super-admin-metrics";
import { createClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";

export function useSuperAdminData(initial: SuperAdminMetrics, initialEvents: EventLogEntry[] = []) {
  const supabase = useMemo(() => createClient(), []);
  const [metrics, setMetrics] = useState<SuperAdminMetrics>(() => normalizeSuperAdminMetrics(initial));
  const [events, setEvents] = useState<EventLogEntry[]>(initialEvents);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMetrics(normalizeSuperAdminMetrics(initial));
    setEvents(initialEvents);
  }, [initial, initialEvents]);

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
    try {
      const [metricsResponse, eventsResponse] = await Promise.all([
        fetch("/api/super-admin/metrics", { cache: "no-store" }),
        fetch("/api/super-admin/events?limit=10", { cache: "no-store" }),
      ]);

      if (metricsResponse.ok) {
        const json = await metricsResponse.json();
        const unwrapped = json.ok ? json.data : json;
        if (isSuperAdminMetrics(unwrapped)) {
          setMetrics(normalizeSuperAdminMetrics(unwrapped));
        } else {
          logger.warn("[useSuperAdminData] Invalid metrics payload from API:", unwrapped);
        }
      }

      if (eventsResponse.ok) {
        const json = await eventsResponse.json();
        const unwrapped = json.ok ? json.data : json;
        if (Array.isArray(unwrapped)) setEvents(unwrapped);
      }
    } catch (err) {
      logger.error("[useSuperAdminData] Failed to refresh metrics and activity:", err);
    } finally {
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
    events,
    refresh,
    loading,
  };
}
