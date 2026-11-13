"use client";

import Link from "next/link";

import { ownerPlanPublicName } from "./owner-plan-names";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";

/**
 * Plan de la academia bajo su nombre, en el lateral de tapiz: rótulo de pista
 * en azul calle (como el lateral de /app), aviso de solo lectura y enlace a
 * los planes cuando el rol puede gestionarlos.
 */
export function OwnerSidebarPlanCard({
  organizationId,
  subscriptionHref,
}: {
  organizationId: string;
  subscriptionHref: string | null;
}) {
  const policy = useOwnerPlanPolicy(organizationId);
  if (policy.status !== "ready") return null;
  const planName = ownerPlanPublicName(policy.planCode);
  if (!planName) return null;

  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <p className="floor-label text-mat-lane">Plan {planName}</p>
      {policy.readOnly ? (
        <p className="flex w-full items-start gap-2 text-xs leading-5 text-white/90">
          <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-signal" />
          Solo lectura: supera la capacidad del plan.
        </p>
      ) : null}
      {subscriptionHref ? (
        <Link
          href={subscriptionHref}
          className="touch-target inline-flex items-center rounded-md text-xs font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Ver planes
        </Link>
      ) : null}
    </div>
  );
}
