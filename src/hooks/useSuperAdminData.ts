import { useCallback, useEffect, useMemo, useState } from "react";

import type { SuperAdminMetrics } from "@/lib/superAdminService";
import { createClient } from "@/lib/supabase/client";

export function useSuperAdminData(initial: SuperAdminMetrics) {
  const supabase = useMemo(() => createClient(), []);
  const [metrics, setMetrics] = useState<SuperAdminMetrics>(initial);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMetrics(initial);
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
        headers: {
          "x-user-id": userId,
        },
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as SuperAdminMetrics;
      setMetrics(payload);
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

