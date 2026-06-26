"use client";

import { memo, useEffect, useState } from "react";
import { Users, UserCheck, LayoutDashboard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DashboardCard } from "./DashboardCard";
import type { KpiTrends } from "@/lib/dashboard/kpi-trends";

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

type TrendKey = keyof KpiTrends;

interface MetricCard {
  title: string;
  value: string | number;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  accent: "sky" | "emerald" | "red" | "amber" | "coral" | "slate" | "zaltyko-primary" | "zaltyko-accent";
  trendKey: TrendKey;
}

function KPISectionImpl({ metrics, academyId, labels }: KPISectionProps) {
  const [trends, setTrends] = useState<KpiTrends | null>(null);

  // Carga las series temporales reales para los sparklines bajo demanda.
  // Si falla, las tarjetas simplemente se muestran sin gráfico (degradación elegante).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch(`/api/dashboard/kpi-trends?academyId=${academyId}&days=14`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.ok && json.data) {
          setTrends(json.data as KpiTrends);
        }
      })
      .catch(() => {
        /* abort o error de red: sin sparklines */
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [academyId]);

  const metricCards: MetricCard[] = [
    {
      title: "Atletas",
      value: metrics.athletes,
      subtitle: "En tu academia",
      href: `/app/${academyId}/athletes`,
      icon: Users,
      accent: "zaltyko-primary",
      trendKey: "athletes",
    },
    {
      title: "Entrenadores",
      value: metrics.coaches,
      subtitle: "Profesionales en tu equipo",
      href: `/app/${academyId}/coaches`,
      icon: UserCheck,
      accent: "sky",
      trendKey: "coaches",
    },
    {
      title: `${labels.groupLabel}s`,
      value: metrics.groups,
      subtitle: `${labels.groupLabel}s activos`,
      href: `/app/${academyId}/groups`,
      icon: LayoutDashboard,
      accent: "zaltyko-accent",
      trendKey: "groups",
    },
    {
      title: "Asistencia",
      value: `${metrics.attendancePercent}%`,
      subtitle: "Últimos 7 días",
      href: `/app/${academyId}/attendance`,
      icon: UserCheck,
      accent: "zaltyko-primary",
      trendKey: "attendance",
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
          trendData={trends?.[card.trendKey]}
        />
      ))}
    </section>
  );
}

export default memo(KPISectionImpl);
export const KPISection = memo(KPISectionImpl);
