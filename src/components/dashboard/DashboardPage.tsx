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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  UserCheck,
  Users,
  Calendar,
  CreditCard,
  Mail,
} from "lucide-react";

import { KPISection } from "@/components/dashboard/KPISection";
import { FinancialSection } from "@/components/dashboard/FinancialSection";
import type { QuickActionsData } from "@/components/dashboard/QuickActionsWidget";
import { WelcomeBanner } from "@/components/onboarding/WelcomeBanner";
import type { DashboardData } from "@/lib/dashboard";
import type { KpiTrends } from "@/lib/dashboard/kpi-trends";
import { loadDashboardAlerts, type DashboardAlert } from "@/lib/dashboard/alerts";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { useDashboardData } from "@/hooks/useDashboardData";
import { ITEM_ROUTES } from "@/lib/onboarding-routes";
import type { ChecklistKey } from "@/lib/onboarding-utils";
import { isSameDayInTimezone, getTodayInCountryTimezone } from "@/lib/date-utils";
import { getSpecializedLabels, pluralizeFirstWord } from "@/lib/specialization/registry";
import { getStarterClassPresets, getStarterGroupPresets } from "@/lib/specialization/operational-presets";
import {
  summarizeStarterClassSetup,
  type StarterSetupClassLike,
  type StarterSetupSummary,
} from "@/lib/classes/starter-setup";
import {
  summarizeStarterGroupSetup,
  type StarterSetupGroupLike,
  type StarterGroupSetupSummary,
} from "@/lib/groups/starter-setup";
import {
  summarizeTechnicalDashboard,
  type TechnicalSummarySourceItem,
} from "@/lib/dashboard/technical-summary";
import { logger } from "@/lib/logger";
import { useDashboardChecklist } from "@/components/dashboard/useDashboardChecklist";
import {
  DashboardHeroSection,
  DashboardOnboardingPanel,
  QuickNavigationSection,
  RecentActivityPanel,
  SportBreakdownSection,
  StarterSetupSection,
} from "@/components/dashboard/DashboardSections";
import { OperationsPulse } from "@/components/dashboard/OperationsPulse";

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

const STEP_ICONS: Record<string, typeof LayoutDashboard> = {
  create_first_group: LayoutDashboard,
  add_5_athletes: Users,
  invite_first_coach: UserCheck,
  setup_weekly_schedule: Calendar,
  enable_payments: CreditCard,
  send_first_communication: Mail,
  login_again: Calendar,
};

type OperationalClassItem = StarterSetupClassLike & TechnicalSummarySourceItem;
type OperationalGroupItem = StarterSetupGroupLike & TechnicalSummarySourceItem;

// Una petición de analítica no debe dejar una tarjeta de primer nivel en
// estado de carga indefinidamente. En conexiones lentas mostramos una salida
// accionable y conservamos el resto del dashboard operativo.
const KPI_TRENDS_TIMEOUT_MS = 10_000;

function DashboardWidgetSkeleton({ className = "h-36" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl border border-border bg-muted/50 ${className}`} aria-hidden="true" />;
}

// Secondary dashboard widgets are useful, but they should not delay the
// first operational view. Keep each one in its own lazy chunk and preserve a
// stable placeholder to avoid layout jumps while it hydrates.
const RecommendationsWidget = dynamic(
  () => import("@/components/dashboard/RecommendationsWidget").then((module) => ({ default: module.RecommendationsWidget })),
  { loading: () => <DashboardWidgetSkeleton className="h-56" /> },
);
const QuickActionsWidget = dynamic(
  () => import("@/components/dashboard/QuickActionsWidget").then((module) => ({ default: module.QuickActionsWidget })),
  { loading: () => <DashboardWidgetSkeleton className="h-56" /> },
);
const TodayClassesWidget = dynamic(
  () => import("@/components/dashboard/TodayClassesWidget").then((module) => ({ default: module.TodayClassesWidget })),
  { loading: () => <DashboardWidgetSkeleton className="h-56" /> },
);
const UpcomingClasses = dynamic(
  () => import("@/components/dashboard/UpcomingClasses").then((module) => ({ default: module.UpcomingClasses })),
  { loading: () => <DashboardWidgetSkeleton className="h-72" /> },
);
const AlertsWidget = dynamic(
  () => import("@/components/dashboard/AlertsWidget").then((module) => ({ default: module.AlertsWidget })),
  { loading: () => <DashboardWidgetSkeleton className="h-32" /> },
);
const UpcomingEventsWidget = dynamic(
  () => import("@/components/dashboard/UpcomingEventsWidget").then((module) => ({ default: module.UpcomingEventsWidget })),
  { loading: () => <DashboardWidgetSkeleton className="h-48" /> },
);
const GymMetricsWidgetLoader = dynamic(
  () => import("@/components/dashboard/GymMetricsWidgetLoader").then((module) => ({ default: module.GymMetricsWidgetLoader })),
  { loading: () => <DashboardWidgetSkeleton className="h-64" /> },
);
const TechnicalOverviewWidget = dynamic(
  () => import("@/components/dashboard/TechnicalOverviewWidget").then((module) => ({ default: module.TechnicalOverviewWidget })),
  { loading: () => <DashboardWidgetSkeleton className="h-64" /> },
);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function asIdList(value: unknown): Array<{ id: string }> {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const id = asOptionalString(asRecord(item)?.id);
        return id ? [{ id }] : [];
      })
    : [];
}

function normalizeOperationalClasses(items: unknown[]): OperationalClassItem[] {
  return items.flatMap((item) => {
    const row = asRecord(item);
    const id = asOptionalString(row?.id);
    const name = asOptionalString(row?.name);
    if (!id || !name) return [];

    const groupId = asOptionalString(row?.groupId);
    return [
      {
        id,
        name,
        weekdays: Array.isArray(row?.weekdays)
          ? row.weekdays.filter((day): day is number => typeof day === "number" && Number.isInteger(day))
          : [],
        startTime: asOptionalString(row?.startTime),
        endTime: asOptionalString(row?.endTime),
        capacity: typeof row?.capacity === "number" && Number.isFinite(row.capacity) ? row.capacity : null,
        coaches: asIdList(row?.coaches),
        groups: asIdList(row?.groups).length > 0 ? asIdList(row?.groups) : groupId ? [{ id: groupId }] : [],
        technicalFocus: asOptionalString(row?.technicalFocus),
        apparatus: asStringArray(row?.apparatus),
        sessionBlocks: asStringArray(row?.sessionBlocks),
      },
    ];
  });
}

function normalizeOperationalGroups(items: unknown[]): OperationalGroupItem[] {
  return items.flatMap((item) => {
    const row = asRecord(item);
    const id = asOptionalString(row?.id);
    const name = asOptionalString(row?.name);
    if (!id || !name) return [];

    return [
      {
        id,
        name,
        level: asOptionalString(row?.level),
        coachId: asOptionalString(row?.coachId),
        athleteCount: typeof row?.athleteCount === "number" && Number.isFinite(row.athleteCount) ? row.athleteCount : 0,
        technicalFocus: asOptionalString(row?.technicalFocus),
        apparatus: asStringArray(row?.apparatus),
        sessionBlocks: asStringArray(row?.sessionBlocks),
      },
    ];
  });
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
  const { data } = useDashboardData({ academyId, tenantId, initialData });
  const labels = getSpecializedLabels(specialization);
  const { progress: checklistProgress, items: checklistItems } = useDashboardChecklist(academyId);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [showFinancials, setShowFinancials] = useState(false);
  const [showRecentActivity, setShowRecentActivity] = useState(false);
  const [showMoreWidgets, setShowMoreWidgets] = useState(false);
  const [starterSetupSummary, setStarterSetupSummary] = useState<StarterSetupSummary | null>(null);
  const [starterGroupSummary, setStarterGroupSummary] = useState<StarterGroupSetupSummary | null>(null);
  const [technicalGroups, setTechnicalGroups] = useState<TechnicalSummarySourceItem[]>([]);
  const [technicalClasses, setTechnicalClasses] = useState<TechnicalSummarySourceItem[]>([]);
  const [quickActionsData, setQuickActionsData] = useState<QuickActionsData | null>(null);
  const [quickActionsLoading, setQuickActionsLoading] = useState(true);
  const quickActionsAbortRef = useRef<AbortController | null>(null);
  const [kpiTrends, setKpiTrends] = useState<KpiTrends | null>(null);
  const [kpiTrendsStatus, setKpiTrendsStatus] = useState<"loading" | "ready" | "error">("loading");
  const kpiTrendsAbortRef = useRef<AbortController | null>(null);
  const [dashboardAlerts, setDashboardAlerts] = useState<DashboardAlert[]>([]);
  const [capacityAlertClassIds, setCapacityAlertClassIds] = useState<string[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const alertsAbortRef = useRef<AbortController | null>(null);

  const loadAlerts = useCallback(async () => {
    alertsAbortRef.current?.abort();
    const controller = new AbortController();
    alertsAbortRef.current = controller;
    setAlertsLoading(true);
    setAlertsError(null);

    try {
      const result = await loadDashboardAlerts({
        academyId,
        academyCountry,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setDashboardAlerts(result.alerts);
      setCapacityAlertClassIds(result.capacityClassIds);
      if (result.failedSources.length > 0) {
        logger.warn("Dashboard alert sources partially unavailable", {
          academyId,
          failedSources: result.failedSources,
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        logger.warn("Dashboard alerts unavailable", { error });
        setDashboardAlerts([]);
        setCapacityAlertClassIds([]);
        setAlertsError("No se pudieron cargar las alertas de la academia.");
      }
    } finally {
      if (!controller.signal.aborted) setAlertsLoading(false);
      if (alertsAbortRef.current === controller) alertsAbortRef.current = null;
    }
  }, [academyCountry, academyId]);

  useEffect(() => {
    void loadAlerts();
    const interval = setInterval(() => void loadAlerts(), 300000);
    return () => {
      clearInterval(interval);
      alertsAbortRef.current?.abort();
    };
  }, [loadAlerts]);

  const capacityAlertClassIdSet = useMemo(
    () => new Set(capacityAlertClassIds),
    [capacityAlertClassIds]
  );

  const loadKpiTrends = useCallback(async () => {
    kpiTrendsAbortRef.current?.abort();
    const controller = new AbortController();
    kpiTrendsAbortRef.current = controller;
    setKpiTrends(null);
    setKpiTrendsStatus("loading");
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      if (kpiTrendsAbortRef.current !== controller || controller.signal.aborted) return;
      timedOut = true;
      controller.abort();
      setKpiTrendsStatus("error");
    }, KPI_TRENDS_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/dashboard/kpi-trends?academyId=${encodeURIComponent(academyId)}&days=14`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`KPI trends request failed: ${response.status}`);
      const payload = (await response.json()) as { ok?: boolean; data?: KpiTrends };
      if (!payload.ok || !payload.data) throw new Error("KPI trends payload missing data");
      if (!controller.signal.aborted) {
        setKpiTrends(payload.data);
        setKpiTrendsStatus("ready");
      }
    } catch (error) {
      if (!controller.signal.aborted || timedOut) {
        logger.warn("Dashboard KPI trends unavailable", { error });
        setKpiTrendsStatus("error");
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (kpiTrendsAbortRef.current === controller) {
        kpiTrendsAbortRef.current = null;
      }
    }
  }, [academyId]);

  useEffect(() => {
    void loadKpiTrends();
    return () => kpiTrendsAbortRef.current?.abort();
  }, [loadKpiTrends]);

  const loadQuickActions = useCallback(async () => {
    quickActionsAbortRef.current?.abort();
    const controller = new AbortController();
    quickActionsAbortRef.current = controller;
    setQuickActionsLoading(true);
    setQuickActionsData(null);

    try {
      const response = await fetch(`/api/quick-actions/pending-today?academyId=${encodeURIComponent(academyId)}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Quick actions request failed: ${response.status}`);
      const payload = (await response.json()) as { ok?: boolean; data?: QuickActionsData };
      if (!payload.ok || !payload.data) throw new Error("Quick actions payload missing data");
      if (!controller.signal.aborted) setQuickActionsData(payload.data);
    } catch (error) {
      if (!controller.signal.aborted) logger.warn("Dashboard quick actions unavailable", { error });
    } finally {
      if (!controller.signal.aborted) setQuickActionsLoading(false);
      if (quickActionsAbortRef.current === controller) quickActionsAbortRef.current = null;
    }
  }, [academyId]);

  useEffect(() => {
    void loadQuickActions();
    return () => quickActionsAbortRef.current?.abort();
  }, [loadQuickActions]);

  // Derivado de las métricas actuales: evita un render intermedio con un
  // estado de bienvenida obsoleto cuando cambia la academia activa.
  const isNewUser = useMemo(
    () => data.metrics.athletes < 3 && data.metrics.groups === 0 && data.metrics.coaches === 0,
    [data.metrics.athletes, data.metrics.groups, data.metrics.coaches]
  );

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
        label: `Agregar ${pluralizeFirstWord(labels.coachLabel).toLowerCase()}`,
        href: `/app/${academyId}/coaches`,
        icon: UserCheck,
      };
    }
    return null;
  }, [academyId, data.metrics, labels.coachLabel]);

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
    const classTemplatesCount = data.metrics.classTemplates ?? 0;
    const assessmentsCount = data.metrics.assessments;

    if (classesToday > 0) {
      return `Hoy tienes ${classesToday} ${classesToday === 1 ? "clase programada" : "clases programadas"}.`;
    }
    if (classesCount > 0) {
      return `Esta semana tienes ${classesCount} ${classesCount === 1 ? "sesión programada" : "sesiones programadas"}.`;
    }
    if (classTemplatesCount > 0) {
      return `Tienes ${classTemplatesCount} ${classTemplatesCount === 1 ? "entrenamiento base" : "entrenamientos base"}; genera sus sesiones para abrir la semana.`;
    }
    if (assessmentsCount > 0) {
      return `Tienes ${assessmentsCount} ${assessmentsCount === 1 ? "evaluación registrada" : "evaluaciones registradas"}.`;
    }
    return "Comienza configurando tu academia para ver tus métricas aquí.";
  }, [academyCountry, data.metrics.classTemplates, data.metrics.classesThisWeek, data.metrics.assessments, data.upcomingClasses]);

  const starterGroupPresets = useMemo(
    () => getStarterGroupPresets(specialization),
    [specialization]
  );
  const starterClassPresets = useMemo(
    () => getStarterClassPresets(specialization, starterGroupPresets),
    [specialization, starterGroupPresets]
  );
  const shouldShowStarterSetupBanner = useMemo(() => {
    const classTemplatesCount = data.metrics.classTemplates ?? 0;

    if (data.metrics.groups === 0 && classTemplatesCount === 0) {
      return false;
    }

    return (
      data.metrics.groups <= starterGroupPresets.length &&
      classTemplatesCount <= Math.max(starterClassPresets.length * 3, starterClassPresets.length)
    );
  }, [data.metrics.classTemplates, data.metrics.groups, starterClassPresets.length, starterGroupPresets.length]);

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

  const shouldLoadOperationalSummaries =
    shouldShowStarterSetupBanner ||
    data.metrics.groups > 0 ||
    data.metrics.classesThisWeek > 0 ||
    (data.metrics.classTemplates ?? 0) > 0;

  useEffect(() => {
    let isMounted = true;
    setStarterSetupSummary(null);
    setStarterGroupSummary(null);
    setTechnicalGroups([]);
    setTechnicalClasses([]);

    if (!shouldLoadOperationalSummaries) {
      return () => {
        isMounted = false;
      };
    }

    const fetchOperationalSummaries = async () => {
      try {
        const [classesResponse, groupsResponse] = await Promise.all([
          fetch(`/api/classes?academyId=${encodeURIComponent(academyId)}&limit=100&includeAssignments=true`, { cache: "no-store" }),
          fetch(`/api/groups?academyId=${encodeURIComponent(academyId)}`, { cache: "no-store" }),
        ]);

        const readItems = async (response: Response): Promise<unknown[]> => {
          if (!response.ok) return [];
          const payload = (await response.json()) as {
            data?: { items?: unknown[] };
            items?: unknown[];
          };
          return Array.isArray(payload.data?.items)
            ? payload.data.items
            : Array.isArray(payload.items)
              ? payload.items
              : [];
        };

        const [classItems, groupItems] = await Promise.all([
          readItems(classesResponse),
          readItems(groupsResponse),
        ]);

        if (!isMounted) return;

        const normalizedClasses = normalizeOperationalClasses(classItems);
        const normalizedGroups = normalizeOperationalGroups(groupItems);
        setTechnicalClasses(normalizedClasses);
        setTechnicalGroups(normalizedGroups);

        if (shouldShowStarterSetupBanner) {
          setStarterSetupSummary(summarizeStarterClassSetup(specialization, normalizedClasses));
          setStarterGroupSummary(summarizeStarterGroupSetup(specialization, normalizedGroups));
        }
      } catch (error) {
        if (isMounted) logger.error("Error fetching operational dashboard summaries:", error);
      }
    };

    void fetchOperationalSummaries();

    return () => {
      isMounted = false;
    };
  }, [academyId, shouldLoadOperationalSummaries, shouldShowStarterSetupBanner, specialization]);

  const technicalDashboardSummary = useMemo(() => {
    const apparatusLabels = Object.fromEntries(
      specialization.evaluation.apparatus.map((item) => [item.code, item.label])
    );

    return summarizeTechnicalDashboard({
      groups: data.metrics.groups === 0 && (data.metrics.classTemplates ?? 0) === 0 ? [] : technicalGroups,
      classes: data.metrics.groups === 0 && (data.metrics.classTemplates ?? 0) === 0 ? [] : technicalClasses,
      apparatusLabels,
    });
  }, [data.metrics.classTemplates, data.metrics.groups, specialization, technicalGroups, technicalClasses]);

  const nextStarterRecommendation = useMemo(() => {
    if (starterGroupSummary && starterGroupSummary.starterGroupCount > 0) {
      if (starterGroupSummary.missingCoachCount > 0) {
        const focusGroupId = starterGroupSummary.items.find((item) =>
          item.issues.includes("Sin responsable asignado")
        )?.id;
        return {
        title: `Asigna responsables a la plantilla base de ${pluralizeFirstWord(labels.groupLabel).toLowerCase()}`,
        description: `Todavía tienes ${starterGroupSummary.missingCoachCount} ${starterGroupSummary.missingCoachCount === 1 ? `${labels.groupLabel.toLowerCase()} sin responsable` : `${pluralizeFirstWord(labels.groupLabel).toLowerCase()} sin responsable`} en la estructura inicial.`,
          href: focusGroupId ? `/app/${academyId}/groups?focusGroup=${focusGroupId}` : `/app/${academyId}/groups`,
        cta: `Ajustar ${pluralizeFirstWord(labels.groupLabel).toLowerCase()}`,
        };
      }

      if (starterGroupSummary.missingLevelCount > 0) {
        const focusGroupId = starterGroupSummary.items.find((item) =>
          item.issues.includes("Nivel pendiente")
        )?.id;
        return {
        title: `Define el nivel técnico de tus ${pluralizeFirstWord(labels.groupLabel).toLowerCase()} base`,
        description: `Quedan ${starterGroupSummary.missingLevelCount} ${starterGroupSummary.missingLevelCount === 1 ? `${labels.groupLabel.toLowerCase()} con nivel pendiente` : `${pluralizeFirstWord(labels.groupLabel).toLowerCase()} con nivel pendiente`} en la plantilla inicial.`,
          href: focusGroupId ? `/app/${academyId}/groups?focusGroup=${focusGroupId}` : `/app/${academyId}/groups`,
          cta: "Revisar niveles",
        };
      }

      if (starterGroupSummary.emptyGroupCount > 0) {
        const focusGroupId = starterGroupSummary.items.find((item) =>
          item.issues.includes("Sin atletas asignados")
        )?.id;
        return {
        title: `Empieza a poblar tus ${pluralizeFirstWord(labels.groupLabel).toLowerCase()} iniciales`,
            description: `Aún hay ${starterGroupSummary.emptyGroupCount} ${starterGroupSummary.emptyGroupCount === 1 ? `${labels.groupLabel.toLowerCase()} sin atletas` : `${pluralizeFirstWord(labels.groupLabel).toLowerCase()} sin atletas`}.`,
          href: focusGroupId ? `/app/${academyId}/groups?focusGroup=${focusGroupId}` : `/app/${academyId}/groups`,
          cta: "Asignar atletas",
        };
      }

      if (starterGroupSummary.missingTemplateCount > 0) {
        return {
          title: "Completa la estructura inicial de grupos",
        description: `Todavía faltan ${starterGroupSummary.missingTemplateCount} ${starterGroupSummary.missingTemplateCount === 1 ? labels.groupLabel.toLowerCase() : pluralizeFirstWord(labels.groupLabel).toLowerCase()} sugeridos por la plantilla base.`,
          href: `/app/${academyId}/groups`,
        cta: `Crear ${pluralizeFirstWord(labels.groupLabel).toLowerCase()}`,
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
        title: `Asigna ${pluralizeFirstWord(labels.coachLabel).toLowerCase()} a la plantilla base`,
        description: `Todavía tienes ${starterSetupSummary.missingCoachCount} ${starterSetupSummary.missingCoachCount === 1 ? `${labels.classLabel.toLowerCase()} sin responsable` : `${pluralizeFirstWord(labels.classLabel).toLowerCase()} sin responsable`} en la estructura inicial.`,
        href: focusClassId ? `/app/${academyId}/classes?focusClass=${focusClassId}` : `/app/${academyId}/classes`,
        cta: `Ajustar ${pluralizeFirstWord(labels.classLabel).toLowerCase()}`,
      };
    }

    if (starterSetupSummary.flexibleScheduleCount > 0) {
      const focusClassId = starterSetupSummary.items.find((item) =>
        item.issues.includes("Horario pendiente")
      )?.id;
      return {
        title: `Cierra los horarios semanales de ${pluralizeFirstWord(labels.classLabel).toLowerCase()}`,
        description: `Aún quedan ${starterSetupSummary.flexibleScheduleCount} bloques base con días u horas pendientes.`,
        href: focusClassId ? `/app/${academyId}/classes?focusClass=${focusClassId}` : `/app/${academyId}/classes`,
        cta: "Revisar horarios",
      };
    }

    if (starterSetupSummary.missingTemplateCount > 0) {
      return {
        title: "Completa la estructura sugerida de arranque",
        description: `Todavía faltan ${starterSetupSummary.missingTemplateCount} ${starterSetupSummary.missingTemplateCount === 1 ? labels.classLabel.toLowerCase() : pluralizeFirstWord(labels.classLabel).toLowerCase()} de la plantilla inicial.`,
        href: `/app/${academyId}/classes`,
        cta: `Crear ${pluralizeFirstWord(labels.classLabel).toLowerCase()}`,
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
      cta: `Ver ${pluralizeFirstWord(labels.classLabel).toLowerCase()}`,
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

  // Obtener todos los pasos pendientes del checklist
  const allPendingSteps = useMemo(() => {
    return checklistItems
      .filter((item) => item.status === "pending")
      .map((item) => {
        const route = ITEM_ROUTES[item.key as ChecklistKey];
        const icon = STEP_ICONS[item.key] || LayoutDashboard;
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
        trends={kpiTrends}
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

      <OperationsPulse series={kpiTrends} status={kpiTrendsStatus} onRetry={() => void loadKpiTrends()} />

      {shouldShowStarterSetupBanner && (
        <StarterSetupSection
          academyId={academyId}
          labels={labels}
          recommendation={nextStarterRecommendation}
          onNavigate={(href) => router.push(href)}
        />
      )}

      {/*2.2. Personalized Recommendations */}
      <section>
        <RecommendationsWidget
          userRole={profileName ? "owner" : "admin"}
          academyId={academyId}
          metrics={{
            athletesCount: data.metrics.athletes,
            classesThisWeek: data.metrics.classesThisWeek,
            pendingPayments: quickActionsData?.overduePayments ?? 0,
            attendanceRate: data.metrics.attendancePercent,
          }}
        />
      </section>

      {/*2.3. Quick Actions Widget - DESTACADO Y ÚTIL */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <QuickActionsWidget
            academyId={academyId}
            data={quickActionsData}
            loading={quickActionsLoading}
            onRefresh={() => void loadQuickActions()}
          />
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

      {/* Widgets secundarios (desglose por rama, resumen técnico, próximos eventos) — colapsados por defecto */}
      {(visibleSportBreakdown.length > 0 ||
        specialization.disciplineVariant === "artistic_female" ||
        specialization.disciplineVariant === "artistic_male" ||
        specialization.disciplineVariant === "rhythmic" ||
        academyType === "ritmica" ||
        academyType === "artistica") && (
        <button
          type="button"
          onClick={() => setShowMoreWidgets((value) => !value)}
          className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-soft"
          aria-expanded={showMoreWidgets}
        >
          {showMoreWidgets ? "Ver menos" : "Ver más: desglose técnico y próximos eventos"}
          {showMoreWidgets ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}

      {showMoreWidgets && (
        <>
          <SportBreakdownSection
            academyId={academyId}
            items={visibleSportBreakdown}
            labels={labels}
            onNavigate={(href) => router.push(href)}
          />

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

          {(academyType === "ritmica" || academyType === "artistica") && (
            <section>
              <GymMetricsWidgetLoader academyId={academyId} />
            </section>
          )}

          <section>
            <UpcomingEventsWidget academyId={academyId} academyCountry={academyCountry} />
          </section>
        </>
      )}

      {/*2.7. Métricas financieras (colapsable) - SOLO ADMIN/OWNER */}
      <FinancialSection
        academyId={academyId}
        isAdmin={isAdmin}
        isOwner={isOwner}
        showFinancials={showFinancials}
        onToggleFinancials={() => setShowFinancials((value) => !value)}
      />

      {/*Banner de bienvenida solo para usuarios completamente nuevos */}
      {isNewUser && (
        <section>
          <WelcomeBanner
            academyName={academyName}
            userName={profileName}
            academyId={academyId}
            isNewUser={isNewUser}
            labels={labels}
          />
        </section>
      )}

      {/*3. Próximas clases - INFORMACIÓN CLAVE VISIBLE */}
      {data.upcomingClasses.length > 0 && (
        <section>
          <UpcomingClasses
            classes={data.upcomingClasses}
            academyId={academyId}
            academyCountry={academyCountry}
            capacityAlertClassIds={capacityAlertClassIdSet}
          />

        </section>
      )}

      {/*3.5. Alertas activas (si hay) - IMPORTANTE VISIBLE */}
      <section>
        <AlertsWidget alerts={dashboardAlerts} loading={alertsLoading} error={alertsError} onRetry={() => void loadAlerts()} />
      </section>

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
