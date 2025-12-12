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
  const usageSummary = plan.athleteLimit != null
    ? `${plan.usedAthletes}/${plan.athleteLimit} atletas`
    : `${plan.usedAthletes} atletas`;
  const classesSummary = plan.classLimit != null
    ? `, ${plan.usedClasses}/${plan.classLimit} clases`
    : "";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            Estado del plan
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-foreground">{effectivePlanName}</h3>
          <p className="text-[10px] capitalize text-muted-foreground">Estado: {plan.status}</p>
        </div>
        <Link
          href={`/app/${academyId}/billing`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary"
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
          className="h-1.5 rounded-full bg-muted"
          indicatorClassName={cn("transition-all", getProgressColor(plan.athletePercent))}
        />
      </div>

      {/* Links a becas y descuentos (solo si el plan no es "free") */}
      {plan.planCode !== "free" && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border/40 pt-3">
          <Link
            href={`/app/${academyId}/billing/scholarships`}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary transition hover:underline"
          >
            Ver becas
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link
            href={`/app/${academyId}/billing/discounts`}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary transition hover:underline"
          >
            Ver descuentos
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

