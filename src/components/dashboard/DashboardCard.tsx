"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const COLOR_STYLES: Record<
  "sky" | "emerald" | "violet" | "amber" | "coral" | "slate" | "zaltyko-primary" | "zaltyko-accent",
  { bg: string; text: string; ring: string; gradient: string }
> = {
  sky: {
    bg: "bg-zaltyko-primary-light/10",
    text: "text-zaltyko-primary-light",
    ring: "group-hover:ring-zaltyko-primary-light/40",
    gradient: "from-zaltyko-primary-light/20 to-transparent",
  },
  emerald: {
    bg: "bg-zaltyko-primary/10",
    text: "text-zaltyko-primary",
    ring: "group-hover:ring-zaltyko-primary/40",
    gradient: "from-zaltyko-primary/20 to-transparent",
  },
  violet: {
    bg: "bg-violet-500/10",
    text: "text-violet-600",
    ring: "group-hover:ring-violet-500/40",
    gradient: "from-violet-500/20 to-transparent",
  },
  amber: {
    bg: "bg-zaltyko-accent/10",
    text: "text-zaltyko-accent",
    ring: "group-hover:ring-zaltyko-accent/40",
    gradient: "from-amber-500/20 to-transparent",
  },
  coral: {
    bg: "bg-rose-500/10",
    text: "text-rose-600",
    ring: "group-hover:ring-rose-500/40",
    gradient: "from-rose-500/20 to-transparent",
  },
  slate: {
    bg: "bg-slate-500/10",
    text: "text-slate-600",
    ring: "group-hover:ring-slate-500/40",
    gradient: "from-slate-500/20 to-transparent",
  },
  "zaltyko-primary": {
    bg: "bg-zaltyko-primary/10",
    text: "text-zaltyko-primary",
    ring: "group-hover:ring-zaltyko-primary/40",
    gradient: "from-zaltyko-primary/20 to-transparent",
  },
  "zaltyko-accent": {
    bg: "bg-zaltyko-accent/10",
    text: "text-zaltyko-accent",
    ring: "group-hover:ring-zaltyko-accent/40",
    gradient: "from-zaltyko-accent/20 to-transparent",
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
        "group relative flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/80 p-5 shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-zaltyko-primary/30 hover:shadow-xl hover:shadow-zaltyko-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] overflow-hidden",
        accentStyles.ring
      )}
    >
      {/* Gradient Background Effect */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
        accentStyles.gradient
      )} />

      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
            {title}
          </p>
          <p className="mt-1 text-3xl font-bold text-foreground tracking-tight">{value}</p>
        </div>
        <div
          className={cn(
            "flex-shrink-0 rounded-2xl p-3 transition-all duration-300 shadow-md",
            accentStyles.bg,
            accentStyles.text,
            "group-hover:scale-110 group-hover:shadow-lg"
          )}
        >
          <Icon className="h-6 w-6" strokeWidth={1.8} />
        </div>
      </div>
      <p className="relative text-sm text-muted-foreground font-medium leading-relaxed">{subtitle}</p>
    </Link>
  );
}

