"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { DashboardPlanUsage } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

interface PlanUsageProps {
  plan: DashboardPlanUsage;
  academyId: string;
}

function getProgressColor(percent: number) {
  if (percent >= 90) return "bg-rose-500";
  if (percent >= 75) return "bg-amber-500";
  return "bg-zaltyko-primary";
}

export function PlanUsage({ plan, academyId }: PlanUsageProps) {
  const effectivePlanName = plan.planNickname ?? plan.planCode?.toUpperCase() ?? "Plan";
  const usageLabel =
    plan.athleteLimit != null
      ? `${plan.usedAthletes}/${plan.athleteLimit} atletas`
      : `${plan.usedAthletes} atletas`;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
            Estado del plan
          </p>
          <h3 className="mt-1 text-xl font-semibold text-foreground">{effectivePlanName}</h3>
          <p className="text-xs capitalize text-muted-foreground">Estado: {plan.status}</p>
        </div>
        <Link
          href={`/app/${academyId}/billing`}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary"
        >
          Mejorar plan
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.8} />
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Atletas</span>
          <span>{usageLabel}</span>
        </div>
        <Progress
          value={plan.athletePercent}
          className="h-2 rounded-full bg-muted"
          indicatorClassName={cn("transition-all", getProgressColor(plan.athletePercent))}
        />
        <p className="text-xs text-muted-foreground">
          {plan.athleteLimit != null
            ? `${plan.athletePercent}% del límite utilizado`
            : "Plan sin límite de atletas"}
        </p>
      </div>

      {plan.classLimit != null && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Clases</span>
            <span>
              {plan.usedClasses}/{plan.classLimit}
            </span>
          </div>
          <Progress
            value={plan.classPercent}
            className="h-2 rounded-full bg-muted"
            indicatorClassName={cn("transition-all", getProgressColor(plan.classPercent))}
          />
          <p className="text-xs text-muted-foreground">
            {plan.classPercent}% de la capacidad de clases utilizada
          </p>
        </div>
      )}
    </div>
  );
}

