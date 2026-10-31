"use client";

import { useEffect, useRef, useState } from "react";
import { beginOwnerPlanUsageRead, markOwnerPlanUsageUnavailable, publishOwnerPlanUsage, useOwnerPlanPolicy } from "./owner-plan-usage-store";

/** Only the minimal operational policy is shared with site-scoped staff. */
export function OwnerOperationalPolicy({ organizationId, locationId }: { organizationId: string; locationId?: string | null }) {
  const [refresh, setRefresh] = useState(0);
  const lastForeground = useRef<number | null>(null);
  const policy = useOwnerPlanPolicy(organizationId);
  useEffect(() => {
    const controller = new AbortController();
    const ticket = beginOwnerPlanUsageRead(organizationId);
    let settled = false;
    const params = new URLSearchParams({ organizationId });
    if (locationId) params.set("locationId", locationId);
    void fetch(`/api/v1/owner/operational-policy?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (controller.signal.aborted) return;
        const data = payload?.ok === true ? payload.data : null;
        if (!response.ok || typeof data?.readOnly !== "boolean" || typeof data?.planCode !== "string" || !data.planCode.trim()) throw new Error("Invalid operational policy");
        settled = true;
        publishOwnerPlanUsage(organizationId, { readOnly: data.readOnly, planCode: data.planCode }, ticket);
      })
      .catch(() => {
        settled = true;
        markOwnerPlanUsageUnavailable(organizationId, ticket, controller.signal.aborted ? "cancelled" : "error");
      });
    return () => {
      controller.abort();
      if (!settled) markOwnerPlanUsageUnavailable(organizationId, ticket, "cancelled");
    };
  }, [organizationId, locationId, refresh]);
  useEffect(() => {
    const update = () => setRefresh(value => value + 1);
    const foreground = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (lastForeground.current !== null && now - lastForeground.current < 750) return;
      lastForeground.current = now;
      update();
    };
    window.addEventListener("zaltyko:plan-usage-changed", update);
    window.addEventListener("focus", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      window.removeEventListener("zaltyko:plan-usage-changed", update);
      window.removeEventListener("focus", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, []);
  if (policy.status === "error") return <div className="px-5 py-2 text-sm"><p role="status">No se ha podido comprobar el estado operativo del plan.</p><button type="button" className="min-h-11 px-4 font-semibold underline" onClick={() => setRefresh(value => value + 1)}>Volver a consultar el uso</button></div>;
  if (policy.status !== "ready" || !policy.readOnly) return null;
  return <aside role="status" className="border-b border-amber-600 bg-amber-50 px-5 py-4 text-sm text-slate-950"><strong>Academia en solo lectura.</strong> Los datos se conservan. La persona Owner debe regularizar la capacidad del plan.</aside>;
}
