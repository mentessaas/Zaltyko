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
    bg: "bg-card",
    border: "border-border",
    icon: "bg-muted text-foreground",
    value: "text-foreground",
  },
  success: {
    bg: "bg-emerald-50/70",
    border: "border-emerald-200",
    icon: "bg-emerald-100 text-emerald-700",
    value: "text-foreground",
  },
  warning: {
    bg: "bg-amber-50/70",
    border: "border-amber-200",
    icon: "bg-amber-100 text-amber-700",
    value: "text-foreground",
  },
  danger: {
    bg: "bg-rose-50/70",
    border: "border-rose-200",
    icon: "bg-rose-100 text-rose-700",
    value: "text-foreground",
  },
  info: {
    bg: "bg-sky-50/80",
    border: "border-sky-200",
    icon: "bg-sky-100 text-sky-700",
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
        "rounded-lg border p-5 transition-all duration-200 hover:shadow-md",
        styles.bg,
        styles.border,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn("text-3xl font-bold tracking-tight", styles.value)}>{value}</p>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          {trend ? (
            <div className="flex items-center gap-1 pt-1">
              {trend.value >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-rose-600" />
              )}
              <span
                className={cn(
                  "text-xs font-medium",
                  trend.value >= 0 ? "text-emerald-600" : "text-rose-600"
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
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg", styles.icon)}>
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
