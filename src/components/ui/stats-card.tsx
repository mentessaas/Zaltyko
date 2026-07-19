"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
  variant?: "default" | "success" | "warning" | "danger" | "info";
  href?: string;
  className?: string;
}

const variantStyles = {
  default: {
    bg: "bg-white",
    border: "border-zaltyko-mist/80",
    icon: "bg-zaltyko-white text-zaltyko-indigo",
    value: "text-foreground",
  },
  success: {
    bg: "bg-white",
    border: "border-zaltyko-teal/30",
    icon: "bg-zaltyko-teal/12 text-zaltyko-teal",
    value: "text-foreground",
  },
  warning: {
    bg: "bg-white",
    border: "border-zaltyko-coral/30",
    icon: "bg-zaltyko-coral/12 text-zaltyko-coral",
    value: "text-foreground",
  },
  danger: {
    bg: "bg-white",
    border: "border-zaltyko-coral/40",
    icon: "bg-zaltyko-coral/12 text-zaltyko-coral",
    value: "text-foreground",
  },
  info: {
    bg: "bg-white",
    border: "border-zaltyko-indigo/25",
    icon: "bg-zaltyko-indigo/10 text-zaltyko-indigo",
    value: "text-foreground",
  },
} as const;

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = "default",
  href,
  className,
}: StatsCardProps) {
  const styles = variantStyles[variant];

  const cardContent = (
    <div
      className={cn(
        "rounded-2xl border p-6 shadow-soft transition-all duration-150 hover:border-zaltyko-teal/40 hover:shadow-medium",
        styles.bg,
        styles.border,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.05em] text-slate-400">{title}</p>
          <p className={cn("font-display text-3xl font-bold tracking-normal", styles.value)}>{value}</p>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          {trend ? (
            <div className="flex items-center gap-1 pt-1">
              {trend.value >= 0 ? (
                <TrendingUp className="h-3 w-3 text-zaltyko-teal" />
              ) : (
                <TrendingDown className="h-3 w-3 text-zaltyko-coral" />
              )}
              <span
                className={cn(
                  "text-xs font-medium",
                trend.value >= 0 ? "text-zaltyko-teal" : "text-zaltyko-coral"
                )}
              >
                {trend.value > 0 ? "+" : ""}
                {trend.value}%
              </span>
              {trend.label ? <span className="text-xs text-muted-foreground">{trend.label}</span> : null}
            </div>
          ) : null}
        </div>

        {icon ? (
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", styles.icon)}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
