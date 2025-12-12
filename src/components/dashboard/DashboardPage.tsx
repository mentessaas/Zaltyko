"use client";

/**
 * DashboardPage - Dashboard principal de la academia
 * 
 * Este componente muestra:
 * 1. Banner de bienvenida (para usuarios nuevos)
 * 2. Header con bienvenida y CTA contextual
 * 3. Widget de próximos pasos (guía contextual)
 * 4. Checklist de onboarding (si está incompleto)
 * 5. KPIs claves (Atletas, Entrenadores, Grupos, % Asistencia)
 * 6. Próximas clases (bloque protagonista)
 * 7. Estado del plan (card compacta)
 * 8. Actividad reciente y grupos activos (zona inferior)
 * 9. Banner discreto de roadmap
 */

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  UserCheck,
  Users,
  Settings,
  Calendar,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Circle,
  CreditCard,
  Mail,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { PlanUsage } from "@/components/dashboard/PlanUsage";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { UpcomingClasses } from "@/components/dashboard/UpcomingClasses";
import { TodayClassesWidget } from "@/components/dashboard/TodayClassesWidget";
import { QuickActionsWidget } from "@/components/dashboard/QuickActionsWidget";
import { GroupsOverview } from "@/components/dashboard/GroupsOverview";
import { AlertsWidget } from "@/components/dashboard/AlertsWidget";
import { UpcomingEventsWidget } from "@/components/dashboard/UpcomingEventsWidget";
import { QuickReportsWidget } from "@/components/dashboard/QuickReportsWidget";
import { FinancialMetricsWidget } from "@/components/dashboard/FinancialMetricsWidget";
import { WelcomeBanner } from "@/components/onboarding/WelcomeBanner";
import { QuickActions } from "@/components/dashboard/QuickActions";
import type { DashboardData } from "@/lib/dashboard";
import { formatAcademyType } from "@/lib/formatters";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { useDashboardData } from "@/hooks/useDashboardData";
import { ITEM_ROUTES } from "@/components/dashboard/OnboardingChecklist";
import type { ChecklistKey } from "@/lib/onboarding-utils";
import { isSameDayInTimezone, getTodayInCountryTimezone, formatShortDateForCountry } from "@/lib/date-utils";

interface DashboardPageProps {
  academyId: string;
  tenantId: string | null;
  academyName: string | null;
  academyType: string | null;
  academyCountry: string | null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  profileName: string | null;
  initialData: DashboardData;
}

export function DashboardPage({
  academyId,
  tenantId,
  academyName,
  academyType,
  academyCountry,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  profileName,
  initialData,
}: DashboardPageProps) {
  const router = useRouter();
  const { tenantAcademies, isAdmin, isOwner } = useAcademyContext();
  const { data, loading } = useDashboardData({ academyId, tenantId, initialData });
  const [checklistProgress, setChecklistProgress] = useState<{ completed: number; total: number } | null>(null);
  const [checklistItems, setChecklistItems] = useState<Array<{
    key: string;
    label: string;
    description: string | null;
    status: "pending" | "completed" | "skipped";
  }>>([]);
  const [isNewUser, setIsNewUser] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);

  // Detectar si es un usuario nuevo (menos de 3 días desde creación o configuración mínima)
  useEffect(() => {
    const isNew = data.metrics.athletes < 3 && data.metrics.groups === 0 && data.metrics.coaches === 0;
    setIsNewUser(isNew);
  }, [data.metrics]);

  // Obtener progreso del checklist y todos los items
  useEffect(() => {
    const fetchChecklist = async () => {
      try {
        const response = await fetch(`/api/onboarding/checklist?academyId=${academyId}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const json = await response.json();
          if (json.summary) {
            setChecklistProgress(json.summary);
          }
          if (json.items) {
            setChecklistItems(json.items);
          }
        }
      } catch (error) {
        console.error("Error fetching checklist:", error);
      }
    };
    fetchChecklist();
  }, [academyId]);

  // Determinar si debe mostrar CTA de configuración o de clases de hoy
  const shouldShowSetupCTA = useMemo(() => {
    return (
      data.metrics.groups === 0 ||
      data.metrics.coaches === 0
    );
  }, [data.metrics.groups, data.metrics.coaches]);

  // Determinar qué falta configurar y redirigir a la página específica
  const getNextSetupStep = useMemo(() => {
    // Prioridad: Grupos → Entrenadores
    if (data.metrics.groups === 0) {
      return {
        label: "Crear tu primer grupo",
        href: `/app/${academyId}/groups`,
        icon: LayoutDashboard,
      };
    }
    if (data.metrics.coaches === 0) {
      return {
        label: "Agregar entrenadores",
        href: `/app/${academyId}/coaches`,
        icon: UserCheck,
      };
    }
    return null;
  }, [data.metrics, academyId]);

  const primaryCTA = useMemo(() => {
    if (shouldShowSetupCTA && getNextSetupStep) {
      return getNextSetupStep;
    }
    return {
      label: "Ver clases de hoy",
      href: `/app/${academyId}/classes?date=today`,
      icon: Calendar,
    };
  }, [shouldShowSetupCTA, getNextSetupStep, academyId]);

  // Mensaje de bienvenida mejorado
  const welcomeMessage = useMemo(() => {
    const today = getTodayInCountryTimezone(academyCountry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const classesToday = data.upcomingClasses.filter((c) => {
      if (c.isSessionPlaceholder) return false;
      return isSameDayInTimezone(c.sessionDate, today, academyCountry);
      // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Determinar si mostrar guías de onboarding
  const showOnboardingGuides = useMemo(() => {
    return (
      data.metrics.athletes < 5 ||
      data.metrics.groups === 0 ||
      data.metrics.coaches === 0 ||
      data.metrics.classesThisWeek === 0
    );
  }, [data.metrics]);

  // Mapeo de iconos para cada tipo de paso
  const stepIcons: Record<string, typeof LayoutDashboard> = {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    create_first_group: LayoutDashboard,
    add_5_athletes: Users,
    invite_first_coach: UserCheck,
    setup_weekly_schedule: Calendar,
    enable_payments: CreditCard,
    send_first_communication: Mail,
    login_again: Calendar,
  };

  // Obtener todos los pasos pendientes del checklist
  const allPendingSteps = useMemo(() => {
    return checklistItems
      .filter((item) => item.status === "pending")
      .map((item) => {
        const route = ITEM_ROUTES[item.key as ChecklistKey];
        const icon = stepIcons[item.key] || LayoutDashboard;
        // eslint-disable-next-line react-hooks/exhaustive-deps
        return {
          label: item.label,
          description: item.description,
          href: route?.href(academyId) || `/app/${academyId}/dashboard`,
          icon,
          cta: route?.cta || "Ir",
        };
      });
  }, [checklistItems, academyId]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
      {/*1. Header con bienvenida + CTA contextual + Estado del plan - SIEMPRE PRIMERO */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground lg:text-3xl">
              {academyName ?? "Academia"} · {formatAcademyType(academyType)}
            </h1>
            <p className="text-sm text-muted-foreground">
              👋 Hola {profileName ?? "equipo"}, {welcomeMessage}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => router.push(primaryCTA.href)}
              className="gap-2"
              size="sm"
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
          </div>
        </div>
        {/*Estado del plan - card compacta a la derecha */}
        <div className="lg:w-72">
          <PlanUsage plan={data.plan} academyId={academyId} />
        </div>
      </section>

      {/*2. KPIs claves - LO MÁS IMPORTANTE ARRIBA */}
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

      {/*2.3. Quick Actions Widget - DESTACADO Y ÚTIL */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <QuickActionsWidget />
        </div>
        <div className="lg:col-span-2">
          {/*2.5. Clases de hoy - DESTACADO SI HAY CLASES HOY */}
          {(() => {
            const today = getTodayInCountryTimezone(academyCountry);
            // eslint-disable-next-line react-hooks/exhaustive-deps
            const hasClassesToday = data.upcomingClasses.some((c) => {
              if (c.isSessionPlaceholder) return false;
              return isSameDayInTimezone(c.sessionDate, today, academyCountry);
              // eslint-disable-next-line react-hooks/exhaustive-deps
            });
            return hasClassesToday ? (
              <TodayClassesWidget classes={data.upcomingClasses} academyId={academyId} academyCountry={academyCountry} />
            ) : null;
          })()}
        </div>
      </section>

      {/*2.6. Métricas financieras y reportes - VALOR INMEDIATO PARA EL DUEÑO */}
      {(isAdmin || isOwner) && (
        <section className="grid gap-4 lg:grid-cols-2">
          <FinancialMetricsWidget academyId={academyId} />
          <QuickReportsWidget academyId={academyId} />
        </section>
      )}

      {/*2.7. Widget de onboarding consolidado (solo si es necesario) - COMPACTO */}
      {showOnboardingGuides && (
        <section className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAllSteps(!showAllSteps)}
                  className="flex items-center justify-center rounded-md p-1 text-primary transition-colors hover:bg-primary/10"
                  aria-label={showAllSteps ? "Ocultar pasos" : "Ver pasos pendientes"}
                  aria-expanded={showAllSteps}
                >
                  {showAllSteps ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                <h3 className="text-sm font-semibold text-foreground">Próximo paso</h3>
                {checklistProgress && (
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                    {checklistProgress.completed}/{checklistProgress.total}
                  </span>
                )}
              </div>
              {checklistProgress && checklistProgress.total > 0 && (
                <div className="space-y-1">
                  <Progress value={Math.round((checklistProgress.completed / checklistProgress.total) * 100)} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {Math.round((checklistProgress.completed / checklistProgress.total) * 100)}% completado
                  </p>
                </div>
              )}
            </div>
            {getNextSetupStep && (
              <Button
                onClick={() => router.push(getNextSetupStep.href)}
                size="sm"
                className="gap-2 shrink-0"
              >
                <getNextSetupStep.icon className="h-3.5 w-3.5" />
                {getNextSetupStep.label}
              </Button>
            )}
          </div>

          {/*Lista de pasos pendientes cuando está expandido */}
          {showAllSteps && allPendingSteps.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-primary/20 pt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Pasos pendientes ({allPendingSteps.length}):
              </p>
              <ul className="space-y-1.5">
                {allPendingSteps.map((step, index) => {
                  const StepIcon = step.icon;
                  return (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => router.push(step.href)}
                        className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-background/50 text-left"
                      >
                        <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <StepIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="block text-muted-foreground font-medium">{step.label}</span>
                          {step.description && (
                            <span className="block text-xs text-muted-foreground/70 mt-0.5">{step.description}</span>
                          )}
                        </div>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/*Banner de bienvenida solo para usuarios completamente nuevos */}
      {isNewUser && (
        <section>
          <WelcomeBanner
            academyName={academyName}
            userName={profileName}
            academyId={academyId}
            isNewUser={isNewUser}
          />
        </section>
      )}

      {/*3. Próximas clases - INFORMACIÓN CLAVE VISIBLE */}
      {data.upcomingClasses.length > 0 && (
        <section>
          <UpcomingClasses classes={data.upcomingClasses} academyId={academyId} academyCountry={academyCountry} />

        </section>
      )}

      {/*3.5. Alertas activas (si hay) - IMPORTANTE VISIBLE */}
      <section>
        <AlertsWidget academyId={academyId} />
      </section>

      {/*4. Contenido secundario en grid */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/*Próximos eventos */}
        <UpcomingEventsWidget academyId={academyId} academyCountry={academyCountry} />

      </section>

      {/*5. Grupos activos */}
      <section>
        <GroupsOverview groups={data.groups} academyId={academyId} />
      </section>

      {/*6. Acciones rápidas (FAB) */}
      <QuickActions academyId={academyId} />

      {/*7. Actividad reciente - AL FINAL */}
      <section>
        <RecentActivity items={data.recentActivity} academyCountry={academyCountry} />

      </section>
    </div>
  );
}

