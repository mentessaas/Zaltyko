"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard/${academyId}`, {
        headers: {
          "x-user-id": userId,
        },
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as DashboardData;
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, [academyId, userId]);

  useEffect(() => {
    if (!academyId || !userId) return;
    refresh();
  }, [academyId, userId, refresh]);

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
          refresh();
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
  }, [academyId, tenantId, supabase, refresh]);

  return {
    data,
    refresh,
    loading,
  };
}

