"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

import { cn } from "@/lib/utils";

// Mapeo de colores legacy a variantes de StatsCard
const COLOR_TO_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  sky: "info",
  emerald: "success",
  red: "default",
  amber: "warning",
  coral: "danger",
  slate: "default",
  "zaltyko-primary": "success",
  "zaltyko-accent": "warning",
};

export interface DashboardCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  accent?: "sky" | "emerald" | "red" | "amber" | "coral" | "slate" | "zaltyko-primary" | "zaltyko-accent";
  trend?: {
    value: number;
    direction: "up" | "down";
  };
}

// Re-export StatsCard as the base component
export { StatsCard } from "@/components/ui/stats-card";

export function DashboardCard({
  title,
  value,
  subtitle,
  href,
  icon: Icon,
  accent = "sky",
  trend,
}: DashboardCardProps) {
  const variant = COLOR_TO_VARIANT[accent] || "default";

  // Convert DashboardCard trend format to StatsCard format
  const statsCardTrend = trend
    ? {
        value: trend.value,
        label: trend.direction === "up" ? "increase" : "decrease",
      }
    : undefined;

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/80 p-5 shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-zaltyko-primary/30 hover:shadow-xl hover:shadow-zaltyko-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] overflow-hidden",
        accent === "emerald" && "hover:ring-4 hover:ring-zaltyko-primary/20",
        accent === "red" && "hover:ring-4 hover:ring-red-500/20",
        accent === "amber" && "hover:ring-4 hover:ring-zaltyko-accent/20",
        accent === "coral" && "hover:ring-4 hover:ring-rose-500/20",
        accent === "sky" && "hover:ring-4 hover:ring-zaltyko-primary-light/20",
        accent === "slate" && "hover:ring-4 hover:ring-slate-500/20"
      )}
    >
      {/* Gradient Background Effect */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
        accent === "emerald" && "from-zaltyko-primary/20 to-transparent",
        accent === "red" && "from-red-500/20 to-transparent",
        accent === "amber" && "from-zaltyko-accent/20 to-transparent",
        accent === "coral" && "from-rose-500/20 to-transparent",
        accent === "sky" && "from-zaltyko-primary-light/20 to-transparent",
        accent === "slate" && "from-slate-500/20 to-transparent"
      )} />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
              {title}
            </p>
            {trend && (
              <span className={cn(
                "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                trend.direction === "up"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700"
              )}>
                {trend.direction === "up" ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {trend.value}%
              </span>
            )}
          </div>
          <p className="mt-1 text-3xl font-bold text-foreground tracking-tight">{value}</p>
        </div>
        <div
          className={cn(
            "flex-shrink-0 rounded-2xl p-3 transition-all duration-300 shadow-md",
            accent === "emerald" && "bg-zaltyko-primary/10 text-zaltyko-primary group-hover:scale-110",
            accent === "red" && "bg-red-500/10 text-red-600 group-hover:scale-110",
            accent === "amber" && "bg-zaltyko-accent/10 text-zaltyko-accent group-hover:scale-110",
            accent === "coral" && "bg-rose-500/10 text-rose-600 group-hover:scale-110",
            accent === "sky" && "bg-zaltyko-primary-light/10 text-zaltyko-primary-light group-hover:scale-110",
            accent === "slate" && "bg-slate-500/10 text-slate-600 group-hover:scale-110"
          )}
        >
          <Icon className="h-6 w-6" strokeWidth={1.8} />
        </div>
      </div>
      <p className="relative text-sm text-muted-foreground font-medium leading-relaxed">{subtitle}</p>
    </Link>
  );
}
