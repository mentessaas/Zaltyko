"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";

import { ownerPlanPublicName } from "./owner-plan-names";
import { decodeOwnerUsage, type OwnerUsage } from "./owner-plan-usage-response";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";

const RESOURCE_LABELS = { athletes: "gimnastas", classes: "clases", groups: "grupos" } as const;
const RESOURCE_ORDER = ["athletes", "classes", "groups"] as const;

/**
 * Franja de plan al pie del hero del Resumen (como PlanUsage «onMat» de /app).
 * - El plan y el estado de solo lectura salen de la política operativa que ya
 *   lee el shell para cualquier rol.
 * - El uso (actual / límite) solo lo puede leer la titular: se pide a la API de
 *   uso existente, la misma de «Plan y facturación». Si falla, la franja se
 *   queda con el plan, sin inventar cifras.
 */
export function OwnerHeroPlanStrip({
  organizationId,
  subscriptionHref,
}: {
  organizationId: string;
  /** Solo para quien puede gestionar el plan; también habilita leer el uso. */
  subscriptionHref: string | null;
}) {
  const policy = useOwnerPlanPolicy(organizationId);
  const canReadUsage = subscriptionHref !== null;
  const [usage, setUsage] = useState<{ organizationId: string; data: OwnerUsage } | null>(null);

  useEffect(() => {
    if (!canReadUsage || typeof fetch !== "function") return;
    const controller = new AbortController();
    const params = new URLSearchParams({ organizationId });
    fetch(`/api/v1/owner/saas/usage?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = decodeOwnerUsage(await response.json());
        if (!controller.signal.aborted && response.ok && data) setUsage({ organizationId, data });
      })
      .catch(() => {
        // Sin uso legible: la franja muestra solo el plan.
      });
    return () => controller.abort();
  }, [organizationId, canReadUsage]);

  const currentUsage = usage?.organizationId === organizationId ? usage.data : null;
  const planCode = currentUsage?.planCode ?? (policy.status === "ready" ? policy.planCode : null);
  const readOnly = currentUsage?.readOnly ?? (policy.status === "ready" ? policy.readOnly : null);
  const planName = ownerPlanPublicName(planCode);
  if (!planName && !currentUsage) return null;

  const resources = currentUsage
    ? RESOURCE_ORDER.flatMap((key) => currentUsage.resources.filter((item) => item.resource === key))
    : [];
  const athletes = resources.find((item) => item.resource === "athletes");
  const athleteMeter =
    athletes && athletes.limit !== null && athletes.limit > 0
      ? {
          percent: Math.min(100, Math.round((athletes.current / athletes.limit) * 100)),
          text: `${athletes.current} de ${athletes.limit} gimnastas`,
        }
      : null;
  const upgrade = planCode === "free" || planCode === "starter" || planCode === "pro";

  return (
    <div className="relative flex flex-col gap-3 border-t border-white/25 px-6 pb-5 pt-4 text-white sm:flex-row sm:items-center sm:gap-6 lg:px-8">
      <p className="shrink-0 text-sm">
        {planName ? <span className="font-display text-lg font-black uppercase">Plan {planName}</span> : null}
        {readOnly !== null ? (
          <span className="text-white/85">
            {planName ? " · " : ""}
            {readOnly ? "Solo lectura" : "Dentro de los límites"}
          </span>
        ) : null}
      </p>
      {resources.length > 0 ? (
        <div className="min-w-0 flex-1">
          <p className="text-sm tabular-nums text-white/90">
            {resources
              .map((item) =>
                item.limit === null
                  ? `${item.current} ${RESOURCE_LABELS[item.resource]}`
                  : `${item.current}/${item.limit} ${RESOURCE_LABELS[item.resource]}`
              )
              .join(" · ")}
          </p>
          {athleteMeter ? (
            <div
              role="progressbar"
              aria-label="Uso del plan: gimnastas"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={athleteMeter.percent}
              aria-valuetext={athleteMeter.text}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20"
            >
              <div
                className={`h-full ${athleteMeter.percent >= 90 ? "bg-signal" : "bg-white"}`}
                style={{ width: `${athleteMeter.percent}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="hidden flex-1 sm:block" />
      )}
      {subscriptionHref ? (
        <Link
          href={subscriptionHref}
          className="touch-target inline-flex shrink-0 items-center gap-1 self-start rounded-md border border-white/50 px-3 text-sm font-bold text-white transition-colors hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:self-auto"
        >
          {upgrade ? "Mejorar plan" : "Ver plan"}
          <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}
