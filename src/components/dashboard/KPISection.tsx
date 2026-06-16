"use client";

import { Users, UserCheck, LayoutDashboard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DashboardCard } from "./DashboardCard";

interface KPISectionProps {
  metrics: {
    athletes: number;
    coaches: number;
    groups: number;
    attendancePercent: number;
  };
  academyId: string;
  labels: {
    groupLabel: string;
    disciplineName: string;
  };
}

interface MetricCard {
  title: string;
  value: string | number;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  accent: "sky" | "emerald" | "red" | "amber" | "coral" | "slate" | "zaltyko-primary" | "zaltyko-accent";
}

export function KPISection({ metrics, academyId, labels }: KPISectionProps) {
  const metricCards: MetricCard[] = [
    {
      title: "Atletas",
      value: metrics.athletes,
      subtitle: "En tu academia",
      href: `/app/${academyId}/athletes`,
      icon: Users,
      accent: "zaltyko-primary",
    },
    {
      title: "Entrenadores",
      value: metrics.coaches,
      subtitle: "Profesionales en tu equipo",
      href: `/app/${academyId}/coaches`,
      icon: UserCheck,
      accent: "slate",
    },
    {
      title: `${labels.groupLabel}s`,
      value: metrics.groups,
      subtitle: `${labels.groupLabel}s activos`,
      href: `/app/${academyId}/groups`,
      icon: LayoutDashboard,
      accent: "sky",
    },
    {
      title: "Asistencia",
      value: `${metrics.attendancePercent}%`,
      subtitle: "Últimos 7 días",
      href: `/app/${academyId}/attendance`,
      icon: UserCheck,
      accent: "zaltyko-primary",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metricCards.map((card) => (
        <DashboardCard
          key={card.title}
          title={card.title}
          value={card.value}
          subtitle={card.subtitle}
          href={card.href}
          icon={card.icon}
          accent={card.accent}
        />
      ))}
    </section>
  );
}
