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
  Store,
  MessageCircle,
  LifeBuoy,
  Wallet,
  ClipboardList,
  Bell,
  FileText,
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
import { RecommendationsWidget } from "@/components/dashboard/RecommendationsWidget";
import { AthleteRetentionWidget } from "@/components/dashboard/AthleteRetentionWidget";
import { PopularClassesWidget } from "@/components/dashboard/PopularClassesWidget";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { GymMetricsWidgetLoader } from "@/components/dashboard/GymMetricsWidgetLoader";
import type { DashboardData } from "@/lib/dashboard";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { useDashboardData } from "@/hooks/useDashboardData";
import { ITEM_ROUTES } from "@/components/dashboard/OnboardingChecklist";
import type { ChecklistKey } from "@/lib/onboarding-utils";
import { isSameDayInTimezone, getTodayInCountryTimezone, formatShortDateForCountry } from "@/lib/date-utils";
import { getSpecializedLabels } from "@/lib/specialization/registry";
import { getStarterClassPresets, getStarterGroupPresets } from "@/lib/specialization/operational-presets";
import { summarizeStarterClassSetup, type StarterSetupSummary } from "@/lib/classes/starter-setup";
import { summarizeStarterGroupSetup, type StarterGroupSetupSummary } from "@/lib/groups/starter-setup";
import {
  summarizeTechnicalDashboard,
  type TechnicalSummarySourceItem,
} from "@/lib/dashboard/technical-summary";
import { TechnicalOverviewWidget } from "@/components/dashboard/TechnicalOverviewWidget";

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
  const { tenantAcademies, isAdmin, isOwner, specialization } = useAcademyContext();
  const { data, loading } = useDashboardData({ academyId, tenantId, initialData });
  const labels = getSpecializedLabels(specialization);
  const [checklistProgress, setChecklistProgress] = useState<{ completed: number; total: number } | null>(null);
  const [checklistItems, setChecklistItems] = useState<Array<{
    key: string;
    label: string;
    description: string | null;
    status: "pending" | "completed" | "skipped";
  }>>([]);
  const [isNewUser, setIsNewUser] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [showFinancials, setShowFinancials] = useState(false);
  const [showRecentActivity, setShowRecentActivity] = useState(false);
  const [starterSetupSummary, setStarterSetupSummary] = useState<StarterSetupSummary | null>(null);
  const [starterGroupSummary, setStarterGroupSummary] = useState<StarterGroupSetupSummary | null>(null);
  const [technicalGroups, setTechnicalGroups] = useState<TechnicalSummarySourceItem[]>([]);
  const [technicalClasses, setTechnicalClasses] = useState<TechnicalSummarySourceItem[]>([]);

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
        title: labels.athletesPlural,
        value: data.metrics.athletes,
        subtitle: `${labels.athletesPlural} activas`,
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
        title: `${labels.groupLabel}s`,
        value: data.metrics.groups,
        subtitle: `${labels.groupLabel}s activos`,
        href: `/app/${academyId}/groups`,
        icon: LayoutDashboard,
        accent: "red" as const,
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
  const starterGroupPresets = useMemo(
    () => getStarterGroupPresets(specialization),
    [specialization]
  );
  const starterClassPresets = useMemo(
    () => getStarterClassPresets(specialization, starterGroupPresets),
    [specialization, starterGroupPresets]
  );
  const shouldShowStarterSetupBanner = useMemo(() => {
    if (data.metrics.groups === 0 && data.metrics.classesThisWeek === 0) {
      return false;
    }

    return (
      data.metrics.groups <= starterGroupPresets.length &&
      data.metrics.classesThisWeek <= Math.max(starterClassPresets.length * 3, starterClassPresets.length)
    );
  }, [data.metrics.classesThisWeek, data.metrics.groups, starterClassPresets.length, starterGroupPresets.length]);

  useEffect(() => {
    if (!shouldShowStarterSetupBanner) {
      setStarterSetupSummary(null);
      setStarterGroupSummary(null);
      return;
    }

    let isMounted = true;

    const fetchStarterSetup = async () => {
      try {
        const [classesResponse, groupsResponse] = await Promise.all([
          fetch(`/api/classes?academyId=${academyId}&limit=100`, {
            cache: "no-store",
          }),
          fetch(`/api/groups?academyId=${academyId}`, {
            cache: "no-store",
          }),
        ]);

        if (classesResponse.ok) {
          const json = await classesResponse.json();
          const summary = summarizeStarterClassSetup(specialization, json.items ?? []);

          if (isMounted) {
            setStarterSetupSummary(summary);
          }
        }

        if (groupsResponse.ok) {
          const json = await groupsResponse.json();
          const summary = summarizeStarterGroupSetup(specialization, json.items ?? []);

          if (isMounted) {
            setStarterGroupSummary(summary);
          }
        }
      } catch (error) {
        console.error("Error fetching starter setup summary:", error);
      }
    };

    fetchStarterSetup();

    return () => {
      isMounted = false;
    };
  }, [academyId, shouldShowStarterSetupBanner, specialization]);

  useEffect(() => {
    if (data.metrics.groups === 0 && data.metrics.classesThisWeek === 0) {
      setTechnicalGroups([]);
      setTechnicalClasses([]);
      return;
    }

    let isMounted = true;

    const fetchTechnicalSummary = async () => {
      try {
        const [groupsResponse, classesResponse] = await Promise.all([
          fetch(`/api/groups?academyId=${academyId}`, { cache: "no-store" }),
          fetch(`/api/classes?academyId=${academyId}&limit=100`, { cache: "no-store" }),
        ]);

        if (groupsResponse.ok) {
          const json = await groupsResponse.json();
          if (isMounted) {
            setTechnicalGroups(Array.isArray(json.items) ? json.items : []);
          }
        }

        if (classesResponse.ok) {
          const json = await classesResponse.json();
          if (isMounted) {
            setTechnicalClasses(Array.isArray(json.items) ? json.items : []);
          }
        }
      } catch (error) {
        console.error("Error fetching technical dashboard summary:", error);
      }
    };

    fetchTechnicalSummary();

    return () => {
      isMounted = false;
    };
  }, [academyId, data.metrics.classesThisWeek, data.metrics.groups]);

  const technicalDashboardSummary = useMemo(() => {
    const apparatusLabels = Object.fromEntries(
      specialization.evaluation.apparatus.map((item) => [item.code, item.label])
    );

    return summarizeTechnicalDashboard({
      groups: technicalGroups,
      classes: technicalClasses,
      apparatusLabels,
    });
  }, [specialization, technicalGroups, technicalClasses]);

  const nextStarterRecommendation = useMemo(() => {
    if (starterGroupSummary && starterGroupSummary.starterGroupCount > 0) {
      if (starterGroupSummary.missingCoachCount > 0) {
        const focusGroupId = starterGroupSummary.items.find((item) =>
          item.issues.includes("Sin responsable asignado")
        )?.id;
        return {
          title: `Asigna responsables a la plantilla base de ${labels.groupLabel.toLowerCase()}s`,
          description: `Todavía tienes ${starterGroupSummary.missingCoachCount} ${starterGroupSummary.missingCoachCount === 1 ? `${labels.groupLabel.toLowerCase()} sin responsable` : `${labels.groupLabel.toLowerCase()}s sin responsable`} en la estructura inicial.`,
          href: focusGroupId ? `/app/${academyId}/groups?focusGroup=${focusGroupId}` : `/app/${academyId}/groups`,
          cta: `Ajustar ${labels.groupLabel.toLowerCase()}s`,
        };
      }

      if (starterGroupSummary.missingLevelCount > 0) {
        const focusGroupId = starterGroupSummary.items.find((item) =>
          item.issues.includes("Nivel pendiente")
        )?.id;
        return {
          title: `Define el nivel técnico de tus ${labels.groupLabel.toLowerCase()}s base`,
          description: `Quedan ${starterGroupSummary.missingLevelCount} ${starterGroupSummary.missingLevelCount === 1 ? `${labels.groupLabel.toLowerCase()} con nivel pendiente` : `${labels.groupLabel.toLowerCase()}s con nivel pendiente`} en la plantilla inicial.`,
          href: focusGroupId ? `/app/${academyId}/groups?focusGroup=${focusGroupId}` : `/app/${academyId}/groups`,
          cta: "Revisar niveles",
        };
      }

      if (starterGroupSummary.emptyGroupCount > 0) {
        const focusGroupId = starterGroupSummary.items.find((item) =>
          item.issues.includes("Sin gimnastas asignadas")
        )?.id;
        return {
          title: `Empieza a poblar tus ${labels.groupLabel.toLowerCase()}s iniciales`,
          description: `Aún hay ${starterGroupSummary.emptyGroupCount} ${starterGroupSummary.emptyGroupCount === 1 ? `${labels.groupLabel.toLowerCase()} sin gimnastas` : `${labels.groupLabel.toLowerCase()}s sin gimnastas`} asignadas.`,
          href: focusGroupId ? `/app/${academyId}/groups?focusGroup=${focusGroupId}` : `/app/${academyId}/groups`,
          cta: "Asignar gimnastas",
        };
      }

      if (starterGroupSummary.missingTemplateCount > 0) {
        return {
          title: "Completa la estructura inicial de grupos",
          description: `Todavía faltan ${starterGroupSummary.missingTemplateCount} ${starterGroupSummary.missingTemplateCount === 1 ? labels.groupLabel.toLowerCase() : `${labels.groupLabel.toLowerCase()}s`} sugeridos por la plantilla base.`,
          href: `/app/${academyId}/groups`,
          cta: `Crear ${labels.groupLabel.toLowerCase()}s`,
        };
      }
    }

    if (!starterSetupSummary || starterSetupSummary.starterClassCount === 0) {
      return null;
    }

    if (starterSetupSummary.missingCoachCount > 0) {
      const focusClassId = starterSetupSummary.items.find((item) =>
        item.issues.includes("Sin responsable asignado")
      )?.id;
      return {
        title: `Asigna ${labels.coachLabel.toLowerCase()}s a la plantilla base`,
        description: `Todavía tienes ${starterSetupSummary.missingCoachCount} ${starterSetupSummary.missingCoachCount === 1 ? `${labels.classLabel.toLowerCase()} sin responsable` : `${labels.classLabel.toLowerCase()}s sin responsable`} en la estructura inicial.`,
        href: focusClassId ? `/app/${academyId}/classes?focusClass=${focusClassId}` : `/app/${academyId}/classes`,
        cta: `Ajustar ${labels.classLabel.toLowerCase()}s`,
      };
    }

    if (starterSetupSummary.flexibleScheduleCount > 0) {
      const focusClassId = starterSetupSummary.items.find((item) =>
        item.issues.includes("Horario pendiente")
      )?.id;
      return {
        title: `Cierra los horarios semanales de ${labels.classLabel.toLowerCase()}s`,
        description: `Aún quedan ${starterSetupSummary.flexibleScheduleCount} bloques base con días u horas pendientes.`,
        href: focusClassId ? `/app/${academyId}/classes?focusClass=${focusClassId}` : `/app/${academyId}/classes`,
        cta: "Revisar horarios",
      };
    }

    if (starterSetupSummary.missingTemplateCount > 0) {
      return {
        title: "Completa la estructura sugerida de arranque",
        description: `Todavía faltan ${starterSetupSummary.missingTemplateCount} ${starterSetupSummary.missingTemplateCount === 1 ? labels.classLabel.toLowerCase() : `${labels.classLabel.toLowerCase()}s`} de la plantilla inicial.`,
        href: `/app/${academyId}/classes`,
        cta: `Crear ${labels.classLabel.toLowerCase()}s`,
      };
    }

    if (starterSetupSummary.missingCapacityCount > 0 || starterSetupSummary.missingGroupCount > 0) {
      const focusClassId = starterSetupSummary.items.find(
        (item) =>
          item.issues.includes("Sin aforo definido") || item.issues.includes("Sin grupo vinculado")
      )?.id;
      return {
        title: "Afina aforo y vínculos de la estructura inicial",
        description: "Quedan detalles operativos por cerrar para que la plantilla funcione como tu base diaria.",
        href: focusClassId ? `/app/${academyId}/classes?focusClass=${focusClassId}` : `/app/${academyId}/classes`,
        cta: "Completar ajustes",
      };
    }

    return {
      title: "La base inicial ya está lista para operar",
      description: `Tu academia ya tiene la plantilla principal afinada para ${labels.disciplineName.toLowerCase()}.`,
      href: `/app/${academyId}/classes`,
      cta: `Ver ${labels.classLabel.toLowerCase()}s`,
    };
  }, [
    academyId,
    labels.classLabel,
    labels.coachLabel,
    labels.disciplineName,
    labels.groupLabel,
    starterGroupSummary,
    starterSetupSummary,
  ]);

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
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 lg:px-8 lg:py-8">
      {/*1. Header con bienvenida + CTA contextual + Estado del plan - SIEMPRE PRIMERO */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground lg:text-3xl">
              {academyName ?? "Academia"} · {labels.disciplineName}
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
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary"
                >
                  <span className="max-w-[120px] truncate">{academyName ?? "Academia"}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {/* Dropdown de academias */}
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-background p-1 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border mb-1">
                    Cambiar de academia
                  </div>
                  {tenantAcademies.map((academy) => (
                    <button
                      key={academy.id}
                      type="button"
                      onClick={() => router.push(`/app/${academy.id}/dashboard`)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        academy.id === academyId
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{academy.name ?? "Sin nombre"}</span>
                      {academy.id === academyId && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
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

      {shouldShowStarterSetupBanner && (
        <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Tu academia ya arrancó con una base recomendada para {labels.disciplineName.toLowerCase()}
              </p>
              <p className="text-sm text-muted-foreground">
                Ahora toca revisar responsables, ajustar horarios y adaptar la plantilla inicial a tu realidad diaria.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => router.push(`/app/${academyId}/groups`)}>
                Revisar {labels.groupLabel.toLowerCase()}s
              </Button>
              <Button size="sm" onClick={() => router.push(`/app/${academyId}/classes`)}>
                Ajustar {labels.classLabel.toLowerCase()}s
              </Button>
            </div>
          </div>
          {nextStarterRecommendation && (
            <div className="mt-4 rounded-md border bg-background/80 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Siguiente ajuste recomendado
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {nextStarterRecommendation.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {nextStarterRecommendation.description}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => router.push(nextStarterRecommendation.href)}>
                  {nextStarterRecommendation.cta}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {(specialization.disciplineVariant === "artistic_female" ||
        specialization.disciplineVariant === "artistic_male" ||
        specialization.disciplineVariant === "rhythmic") && (
        <section>
          <TechnicalOverviewWidget
            academyId={academyId}
            specialization={specialization}
            summary={technicalDashboardSummary}
          />
        </section>
      )}

      {/*2.1. GymMetricsWidget - SOLO PARA GIMNASIA RÍTMICA */}
      {(academyType === "ritmica" || academyType === "artistica") && (
        <section>
          <GymMetricsWidgetLoader academyId={academyId} />
        </section>
      )}

      {/*2.2. Personalized Recommendations */}
      <section>
        <RecommendationsWidget
          userRole={profileName ? "owner" : "admin"}
          academyId={academyId}
          metrics={{
            athletesCount: data.metrics.athletes,
            classesThisWeek: data.metrics.classesThisWeek,
            pendingPayments: 0,
            attendanceRate: data.metrics.attendancePercent,
          }}
        />
      </section>

      {/*2.3. Quick Actions Widget - DESTACADO Y ÚTIL */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <QuickActionsWidget academyId={academyId} />
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

      {/*2.6. Navegación rápida -Solo los 4 más importantes */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <a
          href={`/app/${academyId}/events`}
          className="flex items-center gap-3 rounded-lg border border-border p-3 transition hover:bg-accent hover:border-primary"
        >
          <Calendar className="h-5 w-5 text-blue-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Eventos</p>
            <p className="text-xs text-muted-foreground">Competencias</p>
          </div>
        </a>
        <a
          href={`/app/${academyId}/billing`}
          className="flex items-center gap-3 rounded-lg border border-border p-3 transition hover:bg-accent hover:border-primary"
        >
          <Wallet className="h-5 w-5 text-emerald-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Facturación</p>
            <p className="text-xs text-muted-foreground">Pagos</p>
          </div>
        </a>
        <a
          href={`/app/${academyId}/assessments`}
          className="flex items-center gap-3 rounded-lg border border-border p-3 transition hover:bg-accent hover:border-primary"
        >
          <ClipboardList className="h-5 w-5 text-red-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Evaluaciones</p>
            <p className="text-xs text-muted-foreground">Técnicas</p>
          </div>
        </a>
        <a
          href={`/app/${academyId}/messages`}
          className="flex items-center gap-3 rounded-lg border border-border p-3 transition hover:bg-accent hover:border-primary"
        >
          <MessageCircle className="h-5 w-5 text-green-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Mensajes</p>
            <p className="text-xs text-muted-foreground">Comunicación</p>
          </div>
        </a>
      </section>

      {/*2.7. Métricas financieras (colapsable) - SOLO ADMIN/OWNER */}
      {(isAdmin || isOwner) && (
        <section className="rounded-lg border bg-card">
          <button
            type="button"
            onClick={() => setShowFinancials(!showFinancials)}
            className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-500" />
              <span className="font-medium">Métricas Financieras</span>
            </div>
            {showFinancials ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showFinancials && (
            <div className="space-y-4 p-4 pt-0">
              <div className="grid gap-4 lg:grid-cols-2">
                <FinancialMetricsWidget academyId={academyId} />
                <QuickReportsWidget academyId={academyId} />
              </div>
              {/* Nuevos widgets de analytics */}
              <div className="grid gap-4 lg:grid-cols-2">
                <RevenueTrendChart academyId={academyId} />
                <AthleteRetentionWidget academyId={academyId} />
              </div>
              {/* Widget de clases populares */}
              <PopularClassesWidget academyId={academyId} />
            </div>
          )}
        </section>
      )}

      {/*2.7. Widget de onboarding consolidado (solo si es necesario) - COMPACTO */}
      {showOnboardingGuides && (
        <section className="rounded-lg border bg-card p-4 shadow-sm">
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
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
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
            <div className="mt-4 space-y-2 border-t border-border pt-4">
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

      {/*4. Próximos eventos - Compacto */}
      <section>
        <UpcomingEventsWidget academyId={academyId} academyCountry={academyCountry} />
      </section>

      {/*6. Acciones rápidas (FAB) */}
      <QuickActions academyId={academyId} />

      {/*7. Actividad reciente (colapsable) */}
      <section className="rounded-lg border bg-card">
        <button
          type="button"
          onClick={() => setShowRecentActivity(!showRecentActivity)}
          className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Actividad Reciente</span>
          </div>
          {showRecentActivity ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showRecentActivity && (
          <div className="p-4 pt-0">
            <RecentActivity items={data.recentActivity} academyCountry={academyCountry} />
          </div>
        )}
      </section>
    </div>
  );
}
