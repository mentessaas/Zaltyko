import { useCallback, useEffect, useMemo, useState } from "react";

import type { SuperAdminMetrics } from "@/lib/superAdminService";
import { isSuperAdminMetrics, normalizeSuperAdminMetrics } from "@/lib/super-admin-metrics";
import { createClient } from "@/lib/supabase/client";

export function useSuperAdminData(initial: SuperAdminMetrics) {
  const supabase = useMemo(() => createClient(), []);
  const [metrics, setMetrics] = useState<SuperAdminMetrics>(() => normalizeSuperAdminMetrics(initial));
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    try {
      const response = await fetch("/api/super-admin/metrics", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const json = await response.json();
      const unwrapped = json.ok ? json.data : json;
      if (isSuperAdminMetrics(unwrapped)) {
        setMetrics(normalizeSuperAdminMetrics(unwrapped));
      } else {
        console.warn("[useSuperAdminData] Invalid metrics payload from API:", unwrapped);
      }
    } catch (err) {
      console.error("[useSuperAdminData] Failed to refresh metrics:", err);
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
    refresh,
    loading,
  };
}
