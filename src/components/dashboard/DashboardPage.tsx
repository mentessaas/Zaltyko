"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  Medal,
  UserCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { PlanUsage } from "@/components/dashboard/PlanUsage";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { UpcomingClasses } from "@/components/dashboard/UpcomingClasses";
import { GroupsOverview } from "@/components/dashboard/GroupsOverview";
import type { DashboardData } from "@/lib/dashboard";
import { formatAcademyType } from "@/lib/formatters";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { useDashboardData } from "@/hooks/useDashboardData";

interface DashboardPageProps {
  academyId: string;
  tenantId: string | null;
  academyName: string | null;
  academyType: string | null;
  profileName: string | null;
  initialData: DashboardData;
}

export function DashboardPage({
  academyId,
  tenantId,
  academyName,
  academyType,
  profileName,
  initialData,
}: DashboardPageProps) {
  const router = useRouter();
  const { tenantAcademies } = useAcademyContext();
  const { data, loading } = useDashboardData({ academyId, tenantId, initialData });

  const welcomeMessage = useMemo(() => {
    const classesCount = data.upcomingClasses.length;
    const assessmentsPending = Math.max(data.metrics.assessments - 1, 0);
    return `👋 Hola ${profileName ?? "equipo"}, tienes ${classesCount} ${
      classesCount === 1 ? "clase programada" : "clases programadas"
    } y ${assessmentsPending} evaluación${assessmentsPending === 1 ? "" : "es"} registradas.`;
  }, [data.upcomingClasses.length, data.metrics.assessments, profileName]);

  const metricCards = [
    {
      title: "Atletas",
      value: data.metrics.athletes,
      subtitle: "Atletas activos en esta academia",
      href: `/app/${academyId}/athletes`,
      icon: Users,
      accent: "emerald" as const,
    },
    {
      title: "Entrenadores",
      value: data.metrics.coaches,
      subtitle: "Profesionales en tu equipo",
      href: `/app/${academyId}/coaches`,
      icon: UserCheck,
      accent: "sky" as const,
    },
    {
      title: "Grupos",
      value: data.metrics.groups,
      subtitle: "Grupos activos en operación",
      href: `/app/${academyId}/groups`,
      icon: LayoutDashboard,
      accent: "violet" as const,
    },
    {
      title: "Clases esta semana",
      value: data.metrics.classesThisWeek,
      subtitle: "Sesiones programadas en agenda",
      href: `/app/${academyId}/classes`,
      icon: CalendarDays,
      accent: "amber" as const,
    },
    {
      title: "Evaluaciones",
      value: data.metrics.assessments,
      subtitle: "Evaluaciones técnicas registradas",
      href: `/app/${academyId}/assessments`,
      icon: Medal,
      accent: "coral" as const,
    },
    {
      title: "Plan y facturación",
      value: data.plan.planNickname ?? data.plan.planCode,
      subtitle: `Estado: ${data.plan.status}`,
      href: `/app/${academyId}/billing`,
      icon: CreditCard,
      accent: "slate" as const,
    },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 lg:px-8">
      <section className="flex flex-col gap-6 rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
            Panel general · {formatAcademyType(academyType)}
          </p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-foreground lg:text-4xl">
              {academyName ?? "Academia"}
            </h1>
            <p className="text-sm text-muted-foreground">{welcomeMessage}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {tenantAcademies.length > 1 && (
              <select
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={academyId}
                onChange={(event) => router.push(`/app/${event.target.value}/dashboard`)}
              >
                {tenantAcademies.map((academy) => (
                  <option key={academy.id} value={academy.id}>
                    {academy.name ?? "Academia sin nombre"}
                  </option>
                ))}
              </select>
            )}
            <span className="rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground">
              {!loading ? "Datos al instante" : "Actualizando..."}
            </span>
          </div>
        </div>
        <PlanUsage plan={data.plan} academyId={academyId} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

      <section className="grid gap-6 lg:grid-cols-2">
        <UpcomingClasses classes={data.upcomingClasses} academyId={academyId} />
        <RecentActivity items={data.recentActivity} />
      </section>

      <section>
        <GroupsOverview groups={data.groups} academyId={academyId} />
      </section>

      <section className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-6 text-sm text-muted-foreground">
        <p>
          ¿Necesitas reportes más avanzados o insights personalizados? Muy pronto tendrás dashboards
          descargables e integraciones con IA para planificar sesiones y evaluaciones grupales.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push(`/app/${academyId}/assessments`)}
        >
          Ver evaluaciones
        </Button>
      </section>
    </div>
  );
}

