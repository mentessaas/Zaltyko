"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

import { cn } from "@/lib/utils";

const COLOR_TO_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  sky: "info",
  emerald: "success",
  red: "info",
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
        "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-zaltyko-mist/80 bg-white p-6 shadow-soft transition-all duration-150 hover:border-zaltyko-teal/40 hover:shadow-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.99]"
      )}
    >
      <div className="pointer-events-none absolute right-4 top-4 grid grid-cols-4 gap-1 opacity-[0.08]">
        {Array.from({ length: 16 }).map((_, index) => (
          <span key={index} className="h-1 w-1 rounded-full bg-zaltyko-navy" />
        ))}
      </div>

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-slate-400">
              {title}
            </p>
            {trend && (
              <span className={cn(
                "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                trend.direction === "up"
                  ? "bg-zaltyko-teal/12 text-zaltyko-teal"
                  : "bg-zaltyko-coral/12 text-zaltyko-coral"
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
          <p className="mt-1 font-display text-3xl font-bold tracking-normal text-foreground">{value}</p>
        </div>
        <div
          className={cn(
            "flex-shrink-0 rounded-xl p-3 transition-colors duration-150",
            (variant === "success" || accent === "zaltyko-primary") && "bg-zaltyko-teal/12 text-zaltyko-teal",
            variant === "info" && "bg-zaltyko-indigo/10 text-zaltyko-indigo",
            (variant === "warning" || variant === "danger") && "bg-zaltyko-coral/12 text-zaltyko-coral",
            variant === "default" && "bg-zaltyko-white text-zaltyko-indigo"
          )}
        >
          <Icon className="h-6 w-6" strokeWidth={1.8} />
        </div>
      </div>
      <p className="relative text-sm font-medium leading-relaxed text-zaltyko-text-secondary">{subtitle}</p>
    </Link>
  );
}
