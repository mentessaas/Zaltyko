"use client";

import Link from "next/link";
import { CreditCard } from "lucide-react";

import { useOwnerPlanPolicy } from "./owner-plan-usage-store";

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Starter",
  growth: "Growth",
  premium: "Growth",
  network: "Network",
};

export function OwnerSidebarPlanCard({
  organizationId,
  subscriptionHref,
}: {
  organizationId: string;
  subscriptionHref: string | null;
}) {
  const policy = useOwnerPlanPolicy(organizationId);
  if (policy.status !== "ready") return null;
  const planName = PLAN_NAMES[policy.planCode];
  if (!planName) return null;

  return (
    <div className="mx-3 mb-4 rounded-[12px] border border-z-line p-3.5">
      <div className="flex items-center gap-2 text-xs">
        <CreditCard aria-hidden="true" className="h-4 w-4 shrink-0 text-z-soft" />
        <span className="font-semibold text-z-ink">Plan {planName}</span>
      </div>
      {policy.readOnly ? (
        <p className="mt-1.5 text-xs leading-5 text-z-chalk-600">
          Solo lectura: supera la capacidad del plan.
        </p>
      ) : null}
      {subscriptionHref ? (
        <Link
          href={subscriptionHref}
          className="touch-target mt-1 inline-flex items-center rounded-md text-xs font-semibold text-z-brand-600 hover:text-z-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500"
        >
          Ver planes
        </Link>
      ) : null}
    </div>
  );
}
