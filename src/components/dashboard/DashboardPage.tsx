"use client";

/**
 * DashboardPage - Dashboard principal de la academia
 * 
 * Este componente muestra:
 * 1. Header con bienvenida y CTA contextual
 * 2. KPIs claves (Atletas, Entrenadores, Grupos, % Asistencia)
 * 3. Próximas clases (bloque protagonista)
 * 4. Estado del plan (card compacta)
 * 5. Actividad reciente y grupos activos (zona inferior)
 * 6. Banner discreto de roadmap
 */

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  UserCheck,
  Users,
  Settings,
  Calendar,
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

  // Determinar si debe mostrar CTA de configuración o de clases de hoy
  const shouldShowSetupCTA = useMemo(() => {
    return (
      data.metrics.athletes < 3 ||
      data.metrics.groups === 0 ||
      data.metrics.coaches === 0
    );
  }, [data.metrics.athletes, data.metrics.groups, data.metrics.coaches]);

  const primaryCTA = useMemo(() => {
    if (shouldShowSetupCTA) {
      return {
        label: "Completar configuración",
        href: "/onboarding",
        icon: Settings,
      };
    }
    return {
      label: "Ver clases de hoy",
      href: `/app/${academyId}/classes?date=today`,
      icon: Calendar,
    };
  }, [shouldShowSetupCTA, academyId]);

  // Mensaje de bienvenida mejorado
  const welcomeMessage = useMemo(() => {
    const classesToday = data.upcomingClasses.filter((c) => {
      if (c.isSessionPlaceholder) return false;
      const sessionDate = new Date(c.sessionDate);
      const today = new Date();
      return (
        sessionDate.getDate() === today.getDate() &&
        sessionDate.getMonth() === today.getMonth() &&
        sessionDate.getFullYear() === today.getFullYear()
      );
    }).length;

    const classesCount = data.metrics.classesThisWeek;
    const assessmentsCount = data.metrics.assessments;

    if (classesToday > 0) {
      return `Hoy tienes ${classesToday} ${classesToday === 1 ? "clase programada" : "clases programadas"}.`;
    }
    if (classesCount > 0) {
      return `Esta semana tienes ${classesCount} ${classesCount === 1 ? "clase programada" : "clases programadas"}.`;
    }
    if (assessmentsCount > 0) {
      return `Tienes ${assessmentsCount} evaluación${assessmentsCount === 1 ? "" : "es"} registrada${assessmentsCount === 1 ? "" : "s"}.`;
    }
    return "Comienza configurando tu academia para ver tus métricas aquí.";
  }, [data.metrics.classesThisWeek, data.metrics.assessments, data.upcomingClasses]);

  // KPIs principales (solo 4: Atletas, Entrenadores, Grupos, % Asistencia)
  const metricCards = useMemo(
    () => [
      {
        title: "Atletas",
        value: data.metrics.athletes,
        subtitle: "Atletas activos",
        href: `/app/${academyId}/athletes`,
        icon: Users,
        accent: "zaltyko-primary" as const,
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
        subtitle: "Grupos activos",
        href: `/app/${academyId}/groups`,
        icon: LayoutDashboard,
        accent: "violet" as const,
      },
      {
        title: "Asistencia",
        value: `${data.metrics.attendancePercent}%`,
        subtitle: "Últimos 7 días",
        href: `/app/${academyId}/attendance`,
        icon: UserCheck,
        accent: "emerald" as const,
      },
    ],
    [data.metrics, academyId]
  );

  const CTAIcon = primaryCTA.icon;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 lg:px-8">
      {/* 1. Header con bienvenida + CTA contextual + Estado del plan */}
      <section className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-foreground lg:text-4xl">
              {academyName ?? "Academia"} · {formatAcademyType(academyType)}
            </h1>
            <p className="text-sm text-muted-foreground">
              👋 Hola {profileName ?? "equipo"}, {welcomeMessage}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => router.push(primaryCTA.href)}
              className="gap-2"
            >
              <CTAIcon className="h-4 w-4" />
              {primaryCTA.label}
            </Button>
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
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              {!loading ? "Datos al instante" : "Actualizando..."}
            </span>
          </div>
        </div>
        {/* Estado del plan - card compacta a la derecha */}
        <div className="lg:w-80">
          <PlanUsage plan={data.plan} academyId={academyId} />
        </div>
      </section>

      {/* 2. KPIs claves (máximo 4 cards) */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* 3. Próximas clases (BLOQUE PROTAGONISTA) */}
      <section>
        <UpcomingClasses classes={data.upcomingClasses} academyId={academyId} />
      </section>

      {/* 4. Actividad reciente y grupos activos (zona inferior) */}
      <section className="grid gap-6 lg:grid-cols-2">
        <RecentActivity items={data.recentActivity} />
        <GroupsOverview groups={data.groups} academyId={academyId} />
      </section>

      {/* 5. Banner discreto de roadmap */}
      <section className="rounded-lg border border-border/40 bg-muted/20 p-4 text-sm text-muted-foreground">
        <p className="text-xs">
          💡 ¿Necesitas reportes más avanzados o insights personalizados? Muy pronto tendrás dashboards
          descargables e integraciones con IA para planificar sesiones y evaluaciones grupales.
        </p>
      </section>
    </div>
  );
}

