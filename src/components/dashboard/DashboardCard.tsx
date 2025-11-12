"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const COLOR_STYLES: Record<
  "sky" | "emerald" | "violet" | "amber" | "coral" | "slate",
  { bg: string; text: string; ring: string }
> = {
  sky: {
    bg: "bg-sky-500/10",
    text: "text-sky-600",
    ring: "group-hover:ring-sky-500/40",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600",
    ring: "group-hover:ring-emerald-500/40",
  },
  violet: {
    bg: "bg-violet-500/10",
    text: "text-violet-600",
    ring: "group-hover:ring-violet-500/40",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-600",
    ring: "group-hover:ring-amber-500/40",
  },
  coral: {
    bg: "bg-rose-500/10",
    text: "text-rose-600",
    ring: "group-hover:ring-rose-500/40",
  },
  slate: {
    bg: "bg-slate-500/10",
    text: "text-slate-600",
    ring: "group-hover:ring-slate-500/40",
  },
};

export interface DashboardCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  accent?: keyof typeof COLOR_STYLES;
}

export function DashboardCard({
  title,
  value,
  subtitle,
  href,
  icon: Icon,
  accent = "sky",
}: DashboardCardProps) {
  const accentStyles = COLOR_STYLES[accent];

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-border/60 bg-card/80 p-4 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] sm:p-5 sm:rounded-2xl",
        accentStyles.ring
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
            {title}
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{value}</p>
        </div>
        <div
          className={cn(
            "flex-shrink-0 rounded-full p-2.5 transition-all duration-200",
            accentStyles.bg,
            accentStyles.text,
            "group-hover:scale-110"
          )}
        >
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.6} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground sm:text-sm leading-relaxed">{subtitle}</p>
    </Link>
  );
}

