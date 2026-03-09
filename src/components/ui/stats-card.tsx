"use client";

import Link from "next/link";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
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
    bg: "bg-gradient-to-br from-slate-50 to-slate-100",
    border: "border-slate-200",
    icon: "bg-slate-100 text-slate-600",
    value: "text-slate-900",
  },
  success: {
    bg: "bg-gradient-to-br from-emerald-50 to-emerald-100",
    border: "border-emerald-200",
    icon: "bg-emerald-100 text-emerald-600",
    value: "text-emerald-900",
  },
  warning: {
    bg: "bg-gradient-to-br from-amber-50 to-amber-100",
    border: "border-amber-200",
    icon: "bg-amber-100 text-amber-600",
    value: "text-amber-900",
  },
  danger: {
    bg: "bg-gradient-to-br from-rose-50 to-rose-100",
    border: "border-rose-200",
    icon: "bg-rose-100 text-rose-600",
    value: "text-rose-900",
  },
  info: {
    bg: "bg-gradient-to-br from-blue-50 to-blue-100",
    border: "border-blue-200",
    icon: "bg-blue-100 text-blue-600",
    value: "text-blue-900",
  },
};

const accentVariantStyles = {
  default: {
    bg: "bg-gradient-to-br from-violet-500 to-violet-600",
    border: "border-violet-500",
    icon: "bg-white/20 text-white",
    value: "text-white",
  },
  success: {
    bg: "bg-gradient-to-br from-teal-500 to-teal-600",
    border: "border-teal-500",
    icon: "bg-white/20 text-white",
    value: "text-white",
  },
  warning: {
    bg: "bg-gradient-to-br from-orange-500 to-orange-600",
    border: "border-orange-500",
    icon: "bg-white/20 text-white",
    value: "text-white",
  },
  danger: {
    bg: "bg-gradient-to-br from-rose-500 to-rose-600",
    border: "border-rose-500",
    icon: "bg-white/20 text-white",
    value: "text-white",
  },
  info: {
    bg: "bg-gradient-to-br from-cyan-500 to-cyan-600",
    border: "border-cyan-500",
    icon: "bg-white/20 text-white",
    value: "text-white",
  },
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  href,
  className,
}: StatsCardProps) {
  const isAccent = ["success", "warning", "danger", "info"].includes(variant);
  const styles = isAccent ? accentVariantStyles[variant] : variantStyles[variant];

  const cardContent = (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:shadow-lg",
        styles.bg,
        styles.border,
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-zaltyko-text-secondary">{title}</p>
          <p className={cn("text-3xl font-bold tracking-tight", styles.value)}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-zaltyko-text-secondary">{subtitle}</p>
          )}
          {trend && (
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
              {trend.label && (
                <span className="text-xs text-zaltyko-text-secondary">
                  {trend.label}
                </span>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl",
              styles.icon
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={1.5} />
          </div>
        )}
      </div>

      {/* Decorative gradient blob */}
      <div
        className={cn(
          "absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-20 blur-2xl",
          variant === "success" && "bg-emerald-400",
          variant === "warning" && "bg-amber-400",
          variant === "danger" && "bg-rose-400",
          variant === "info" && "bg-cyan-400",
          variant === "default" && "bg-slate-400"
        )}
      />
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
