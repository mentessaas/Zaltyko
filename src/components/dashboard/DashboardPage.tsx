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

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  UserCheck,
  Users,
  Calendar,
  CreditCard,
  Mail,
} from "lucide-react";

import { KPISection } from "@/components/dashboard/KPISection";
import { FinancialSection } from "@/components/dashboard/FinancialSection";
import { UpcomingClasses } from "@/components/dashboard/UpcomingClasses";
import { TodayClassesWidget } from "@/components/dashboard/TodayClassesWidget";
import { QuickActionsWidget } from "@/components/dashboard/QuickActionsWidget";
import { AlertsWidget } from "@/components/dashboard/AlertsWidget";
import { UpcomingEventsWidget } from "@/components/dashboard/UpcomingEventsWidget";
import { WelcomeBanner } from "@/components/onboarding/WelcomeBanner";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecommendationsWidget } from "@/components/dashboard/RecommendationsWidget";
import { GymMetricsWidgetLoader } from "@/components/dashboard/GymMetricsWidgetLoader";
import type { DashboardData } from "@/lib/dashboard";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { useDashboardData } from "@/hooks/useDashboardData";
import { ITEM_ROUTES } from "@/components/dashboard/OnboardingChecklist";
import type { ChecklistKey } from "@/lib/onboarding-utils";
import { isSameDayInTimezone, getTodayInCountryTimezone } from "@/lib/date-utils";
import { getSpecializedLabels } from "@/lib/specialization/registry";
import { getStarterClassPresets, getStarterGroupPresets } from "@/lib/specialization/operational-presets";
import { summarizeStarterClassSetup, type StarterSetupSummary } from "@/lib/classes/starter-setup";
import { summarizeStarterGroupSetup, type StarterGroupSetupSummary } from "@/lib/groups/starter-setup";
import {
  summarizeTechnicalDashboard,
  type TechnicalSummarySourceItem,
} from "@/lib/dashboard/technical-summary";
import { TechnicalOverviewWidget } from "@/components/dashboard/TechnicalOverviewWidget";
import { useDashboardChecklist } from "@/components/dashboard/useDashboardChecklist";
import {
  DashboardHeroSection,
  DashboardOnboardingPanel,
  QuickNavigationSection,
  RecentActivityPanel,
  SportBreakdownSection,
  StarterSetupSection,
} from "@/components/dashboard/DashboardSections";

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
  const { progress: checklistProgress, items: checklistItems } = useDashboardChecklist(academyId);
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
          item.issues.includes("Sin atletas asignados")
        )?.id;
        return {
          title: `Empieza a poblar tus ${labels.groupLabel.toLowerCase()}s iniciales`,
          description: `Aún hay ${starterGroupSummary.emptyGroupCount} ${starterGroupSummary.emptyGroupCount === 1 ? `${labels.groupLabel.toLowerCase()} sin atletas` : `${labels.groupLabel.toLowerCase()}s sin atletas`} asignados.`,
          href: focusGroupId ? `/app/${academyId}/groups?focusGroup=${focusGroupId}` : `/app/${academyId}/groups`,
          cta: "Asignar atletas",
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
      <DashboardHeroSection
        academyId={academyId}
        academyName={academyName}
        labels={labels}
        plan={data.plan}
        primaryCTA={primaryCTA}
        profileName={profileName}
        tenantAcademies={tenantAcademies}
        welcomeMessage={welcomeMessage}
        onNavigate={(href) => router.push(href)}
      />

      <KPISection
        metrics={data.metrics}
        academyId={academyId}
        labels={labels}
      />

      <SportBreakdownSection
        academyId={academyId}
        items={visibleSportBreakdown}
        labels={labels}
        onNavigate={(href) => router.push(href)}
      />

      {shouldShowStarterSetupBanner && (
        <StarterSetupSection
          academyId={academyId}
          labels={labels}
          recommendation={nextStarterRecommendation}
          onNavigate={(href) => router.push(href)}
        />
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

      <QuickNavigationSection academyId={academyId} />

      {/*2.7. Métricas financieras (colapsable) - SOLO ADMIN/OWNER */}
      <FinancialSection
        academyId={academyId}
        isAdmin={isAdmin}
        isOwner={isOwner}
        showFinancials={showFinancials}
        onToggleFinancials={() => setShowFinancials((value) => !value)}
      />

      {showOnboardingGuides && (
        <DashboardOnboardingPanel
          nextSetupStep={getNextSetupStep}
          pendingSteps={allPendingSteps}
          progress={checklistProgress}
          showAllSteps={showAllSteps}
          onNavigate={(href) => router.push(href)}
          onToggleSteps={() => setShowAllSteps((value) => !value)}
        />
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

      <RecentActivityPanel
        academyCountry={academyCountry}
        expanded={showRecentActivity}
        items={data.recentActivity}
        onToggle={() => setShowRecentActivity((value) => !value)}
      />
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-busy="true" aria-label="Cargando dashboard">
      {/* Header skeleton */}
      <div className="h-24 bg-muted rounded-xl" />
      {/* KPI grid skeleton */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-muted rounded-xl" />
        ))}
      </div>
      {/* Content grid skeleton */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-96 bg-muted rounded-xl" />
        <div className="h-96 bg-muted rounded-xl" />
      </div>
    </div>
  );
}
