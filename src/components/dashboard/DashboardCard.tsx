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
        "group relative flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        accentStyles.ring
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/90">
            {title}
          </p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{value}</p>
        </div>
        <div
          className={cn(
            "rounded-full p-2 transition",
            accentStyles.bg,
            accentStyles.text,
            "group-hover:scale-105"
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.6} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </Link>
  );
}

