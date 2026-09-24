"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { DashboardPlanUsage } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { getProductPlanPublicName } from "@/lib/plans/catalog";
import { getSubscriptionStatusLabel } from "@/lib/billing/subscription-status-labels";

interface PlanUsageProps {
  plan: DashboardPlanUsage;
  academyId: string;
  athleteLabel: string;
  classLabel: string;
}

function getProgressColor(percent: number) {
  if (percent >= 90) return "bg-zaltyko-coral";
  if (percent >= 75) return "bg-zaltyko-indigo";
  return "bg-zaltyko-teal";
}

export function PlanUsage({ plan, academyId, athleteLabel, classLabel }: PlanUsageProps) {
  const effectivePlanName = getProductPlanPublicName(plan.planCode, plan.planNickname);
  const usageSummary = plan.athleteLimit != null
    ? `${plan.usedAthletes}/${plan.athleteLimit} ${athleteLabel}`
    : `${plan.usedAthletes} ${athleteLabel}`;
  const classesSummary = plan.classLimit != null
    ? `, ${plan.usedClasses}/${plan.classLimit} ${classLabel}`
    : "";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Estado del plan
          </p>
          <h3 className="mt-0.5 font-display text-base font-semibold text-foreground">{effectivePlanName}</h3>
          <p className="text-[10px] text-muted-foreground">Estado: {getSubscriptionStatusLabel(plan.status)}</p>
        </div>
        <Link
          href={`/app/${academyId}/billing`}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zaltyko-indigo/25 px-2 py-1 text-[10px] font-semibold text-zaltyko-indigo transition hover:bg-zaltyko-indigo/5 dark:border-zaltyko-electric/35 dark:text-zaltyko-electric dark:hover:bg-zaltyko-electric/10"
        >
          Mejorar
          <ArrowUpRight className="h-3 w-3" strokeWidth={1.8} />
        </Link>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
          <span>Resumen</span>
          <span className="text-xs font-semibold text-foreground">
            {usageSummary}{classesSummary}
          </span>
        </div>
        <Progress
          value={plan.athletePercent}
          aria-label="Uso del plan"
          className="h-1.5 rounded-full bg-zaltyko-mist/35"
          indicatorClassName={cn("transition-all", getProgressColor(plan.athletePercent))}
        />
      </div>

      {/* Links a becas y descuentos (solo si el plan no es "free") */}
      {plan.planCode !== "free" && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
          <Link
            href={`/app/${academyId}/billing/scholarships`}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-zaltyko-teal transition hover:underline"
          >
            Ver becas
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link
            href={`/app/${academyId}/billing/discounts`}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-zaltyko-teal transition hover:underline"
          >
            Ver descuentos
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
