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
import { KPISection } from "@/components/dashboard/KPISection";
import { FinancialSection } from "@/components/dashboard/FinancialSection";
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
        accent: "slate" as const,
      },
      {
        title: `${labels.groupLabel}s`,
        value: data.metrics.groups,
        subtitle: `${labels.groupLabel}s activos`,
        href: `/app/${academyId}/groups`,
        icon: LayoutDashboard,
        accent: "sky" as const,
      },
      {
        title: "Asistencia",
        value: `${data.metrics.attendancePercent}%`,
        subtitle: "Últimos 7 días",
        href: `/app/${academyId}/attendance`,
        icon: UserCheck,
        accent: "zaltyko-primary" as const,
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

  const visibleSportBreakdown = useMemo(
    () =>
      (data.sportConfigBreakdown ?? []).filter(
        (item) =>
          data.sportConfigBreakdown.length > 1 ||
          item.athletes > 0 ||
          item.groups > 0 ||
          item.classes > 0
      ),
    [data.sportConfigBreakdown]
  );

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
    <div className="mx-auto flex max-w-7xl flex-col gap-7 py-6 lg:py-8">
      <section className="zaltyko-motion-lines overflow-hidden rounded-2xl border border-zaltyko-mist/70 bg-white px-5 py-5 shadow-soft lg:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zaltyko-teal">
              Panel operativo
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-normal text-zaltyko-navy lg:text-3xl">
              {academyName ?? "Academia"} · {labels.disciplineName}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zaltyko-text-secondary">
              Hola {profileName ?? "equipo"}. {welcomeMessage}
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
                  className="flex items-center gap-2 rounded-full border border-zaltyko-mist bg-white px-3 py-1.5 text-xs font-semibold text-zaltyko-text-secondary transition hover:border-zaltyko-teal hover:text-zaltyko-teal"
                >
                  <span className="max-w-[120px] truncate">{academyName ?? "Academia"}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {/* Dropdown de academias */}
                <div className="invisible absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-zaltyko-mist bg-white p-1 opacity-0 shadow-medium transition-all group-hover:visible group-hover:opacity-100">
                  <div className="mb-1 border-b border-zaltyko-mist px-3 py-2 text-xs font-semibold text-slate-400">
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
                          : "hover:bg-zaltyko-white"
                      }`}
                    >
                      <span className="truncate">{academy.name ?? "Sin nombre"}</span>
                      {academy.id === academyId && (
                        <span className="h-2 w-2 rounded-full bg-zaltyko-teal" />
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
        </div>
      </section>

      <KPISection
        metrics={data.metrics}
        academyId={academyId}
        labels={labels}
      />

      {visibleSportBreakdown.length > 0 && (
        <section className="rounded-2xl border border-zaltyko-mist bg-white p-5 shadow-soft">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-teal">
                Distribución deportiva
              </p>
              <h2 className="font-display text-xl font-semibold text-zaltyko-navy">
                Actividad por rama
              </h2>
            </div>
            <Button size="sm" variant="outline" onClick={() => router.push(`/app/${academyId}/settings`)}>
              Gestionar ramas
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {visibleSportBreakdown.map((item) => (
              <div key={item.sportConfigId} className="rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-4">
                <p className="text-sm font-semibold text-zaltyko-navy">{item.branchName}</p>
                <p className="text-xs text-zaltyko-text-secondary">{item.disciplineName}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="font-display text-xl font-semibold text-zaltyko-navy">{item.athletes}</p>
                    <p className="text-[11px] text-zaltyko-text-secondary">{labels.athletesPlural}</p>
                  </div>
                  <div>
                    <p className="font-display text-xl font-semibold text-zaltyko-navy">{item.groups}</p>
                    <p className="text-[11px] text-zaltyko-text-secondary">{labels.groupLabel}s</p>
                  </div>
                  <div>
                    <p className="font-display text-xl font-semibold text-zaltyko-navy">{item.classes}</p>
                    <p className="text-[11px] text-zaltyko-text-secondary">{labels.classLabel}s</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {shouldShowStarterSetupBanner && (
        <section className="rounded-2xl border border-zaltyko-teal/20 bg-zaltyko-teal/5 p-5 shadow-soft">
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
            <div className="mt-4 rounded-xl border border-zaltyko-mist bg-white/90 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-zaltyko-teal">
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
          className="flex items-center gap-3 rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft transition hover:border-zaltyko-teal/40"
        >
          <Calendar className="h-5 w-5 text-zaltyko-indigo" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Eventos</p>
            <p className="text-xs text-muted-foreground">Competencias</p>
          </div>
        </a>
        <a
          href={`/app/${academyId}/billing`}
          className="flex items-center gap-3 rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft transition hover:border-zaltyko-teal/40"
        >
          <Wallet className="h-5 w-5 text-zaltyko-teal" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Facturación</p>
            <p className="text-xs text-muted-foreground">Pagos</p>
          </div>
        </a>
        <a
          href={`/app/${academyId}/assessments`}
          className="flex items-center gap-3 rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft transition hover:border-zaltyko-teal/40"
        >
          <ClipboardList className="h-5 w-5 text-zaltyko-indigo" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Evaluaciones</p>
            <p className="text-xs text-muted-foreground">Técnicas</p>
          </div>
        </a>
        <a
          href={`/app/${academyId}/messages`}
          className="flex items-center gap-3 rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft transition hover:border-zaltyko-teal/40"
        >
          <MessageCircle className="h-5 w-5 text-zaltyko-teal" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Mensajes</p>
            <p className="text-xs text-muted-foreground">Comunicación</p>
          </div>
        </a>
      </section>

      {/*2.7. Métricas financieras (colapsable) - SOLO ADMIN/OWNER */}
      <FinancialSection
        academyId={academyId}
        isAdmin={isAdmin}
        isOwner={isOwner}
        showFinancials={showFinancials}
        onToggleFinancials={() => setShowFinancials(!showFinancials)}
      />

      {/*2.7. Widget de onboarding consolidado (solo si es necesario) - COMPACTO */}
      {showOnboardingGuides && (
        <section className="rounded-2xl border border-zaltyko-mist bg-white p-5 shadow-soft">
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
                <div className="mt-4 space-y-2 border-t border-zaltyko-mist pt-4">
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
                        className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-zaltyko-white"
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
      <section className="overflow-hidden rounded-2xl border border-zaltyko-mist bg-white shadow-soft">
        <button
          type="button"
          onClick={() => setShowRecentActivity(!showRecentActivity)}
          className="flex w-full items-center justify-between p-5 text-left transition hover:bg-zaltyko-white/80"
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
