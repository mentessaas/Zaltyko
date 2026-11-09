"use client";

import { memo } from "react";
import Link from "next/link";
import { Users, UserCheck, LayoutDashboard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { KpiTrends } from "@/lib/dashboard/kpi-trends";
import { pluralizeFirstWord } from "@/lib/specialization/registry";

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
    athletesPlural: string;
    coachLabel: string;
  };
  trends: KpiTrends | null;
}

type TrendKey = keyof KpiTrends;

interface MetricCard {
  title: string;
  value: string | number;
  valueSuffix?: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  accent: "sky" | "emerald" | "red" | "amber" | "coral" | "slate" | "zaltyko-primary" | "zaltyko-accent";
  trendKey: TrendKey;
}

function KPISectionImpl({ metrics, academyId, labels, trends }: KPISectionProps) {
  const metricCards: MetricCard[] = [
    {
      title: labels.athletesPlural,
      value: metrics.athletes,
      subtitle: "En tu academia",
      href: `/app/${academyId}/athletes`,
      icon: Users,
      accent: "zaltyko-primary",
      trendKey: "athletes",
    },
    {
      title: pluralizeFirstWord(labels.coachLabel),
      value: metrics.coaches,
      subtitle: "Profesionales en tu equipo",
      href: `/app/${academyId}/coaches`,
      icon: UserCheck,
      accent: "sky",
      trendKey: "coaches",
    },
    {
      title: pluralizeFirstWord(labels.groupLabel),
      value: metrics.groups,
      subtitle: `${pluralizeFirstWord(labels.groupLabel)} activos`,
      href: `/app/${academyId}/groups`,
      icon: LayoutDashboard,
      accent: "zaltyko-accent",
      trendKey: "groups",
    },
    {
      title: "Asistencia",
      // Sin gimnastas no hay porcentaje que dar: «—» en vez de un 0 % engañoso.
      value: metrics.athletes === 0 ? "—" : metrics.attendancePercent,
      valueSuffix: metrics.athletes === 0 ? undefined : "%",
      subtitle: "Últimos 7 días",
      href: `/app/${academyId}/attendance`,
      icon: UserCheck,
      accent: "zaltyko-primary",
      trendKey: "attendance",
    },
  ];

  // Marcador reglado: cuatro celdas sobre una sola línea de cinta, cifras
  // condensadas grandes, como el panel de puntuaciones del pabellón. Cada
  // celda lleva a su listado. (La serie de 14 días vive en «Pulso operativo».)
  void trends;
  return (
    <section aria-label="Resumen de la academia" className="overflow-hidden rounded-xl border border-chalk-line bg-white">
      <ul className="grid grid-cols-2 border-t-[3px] border-mat-night lg:grid-cols-4">
        {metricCards.map((card, i) => (
          // Línea de marcador: cifra y nombre en la misma línea base, sin
          // icono ni tarjeta; el detalle debajo en pequeño.
          <li
            key={card.title}
            className={[
              "border-chalk-line",
              i % 2 === 1 ? "border-l" : "",
              i >= 2 ? "border-t lg:border-t-0" : "",
              i > 0 ? "lg:border-l" : "",
            ].join(" ")}
          >
            <Link
              href={card.href}
              className="group flex h-full flex-col justify-center gap-1 px-5 py-4 transition-colors hover:bg-mat-wash focus-visible:ring-inset focus-visible:ring-offset-0"
            >
              <span className="flex items-baseline gap-2">
                <span className="font-display tabular text-3xl font-black leading-none text-mat-night">
                  {card.value}
                  {card.valueSuffix ?? ""}
                </span>
                <span className="font-display text-lg font-extrabold uppercase leading-none text-mat group-hover:underline">
                  {card.title}
                </span>
              </span>
              <span className="text-xs text-ramp-500">{card.subtitle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default memo(KPISectionImpl);
export const KPISection = memo(KPISectionImpl);
