"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  Users,
  Clock,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  Loader2,
} from "lucide-react";

import { ClassesTableView } from "@/components/classes/ClassesTableView";
import { CreateClassDialog } from "@/components/classes/CreateClassDialog";
import { EditClassDialog } from "@/components/classes/EditClassDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { summarizeStarterClassSetup } from "@/lib/classes/starter-setup";

interface ClassItem {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  technicalFocus?: string | null;
  apparatus?: string[];
  isExtra: boolean;
  autoGenerateSessions: boolean;
  allowsFreeTrial: boolean;
  waitingListEnabled: boolean;
  cancellationHoursBefore: number;
  cancellationPolicy: string;
  currentEnrollment?: number;
  createdAt: string | null;
  coaches: Array<{ id: string; name: string; email: string | null }>;
  groups: Array<{ id: string; name: string; color: string | null }>;
}

interface CoachOption {
  id: string;
  name: string;
  email: string | null;
}

interface GroupOption {
  id: string;
  name: string;
  color: string | null;
}

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  trend?: { value: number; label: string };
  variant?: "default" | "success" | "warning" | "danger";
}

function StatsCard({ title, value, icon, description, trend, variant = "default" }: StatsCardProps) {
  const variantStyles = {
    default: "bg-white border-zaltyko-mist",
    success: "bg-white border-zaltyko-teal/30",
    warning: "bg-white border-zaltyko-indigo/25",
    danger: "bg-white border-zaltyko-coral/35",
  };

  const iconStyles = {
    default: "text-zaltyko-indigo",
    success: "text-zaltyko-teal",
    warning: "text-zaltyko-indigo",
    danger: "text-zaltyko-coral",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-soft ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.05em] text-slate-400">{title}</p>
          <p className="mt-1 font-display text-3xl font-bold text-zaltyko-navy">{value}</p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1 text-xs">
              <TrendingUp className="h-3 w-3 text-zaltyko-teal" />
              <span className="text-zaltyko-teal">{trend.value}%</span>
              <span className="text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        <div className="rounded-xl bg-zaltyko-white p-3">
          <div className={iconStyles[variant]}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

interface ClassesDashboardProps {
  academyId: string;
  initialClasses?: ClassItem[];
  availableCoaches: CoachOption[];
  groupOptions: GroupOption[];
  initialFocusClassId?: string;
}

export function ClassesDashboard({
  academyId,
  initialClasses = [],
  availableCoaches,
  groupOptions,
  initialFocusClassId,
}: ClassesDashboardProps) {
  const { specialization } = useAcademyContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [classes, setClasses] = useState<ClassItem[]>(initialClasses);
  const [stats, setStats] = useState({
    totalClasses: 0,
    totalSessions: 0,
    upcomingSessions: 0,
    utilizationRate: 0,
  });
  const [isLoading, setIsLoading] = useState(initialClasses.length === 0);
  const [createOpen, setCreateOpen] = useState(false);
  const [guidedEditingClass, setGuidedEditingClass] = useState<ClassItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const starterSetup = summarizeStarterClassSetup(specialization, classes);
  const starterClassCount = starterSetup.starterClassCount;

  // Cargar clases desde la API
  const fetchClasses = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/classes?academyId=${academyId}&limit=100`);
      if (response.ok) {
        const data = await response.json();
        setClasses(data.items ?? []);
      }
    } catch (error) {
      console.error("Error fetching classes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialClasses.length === 0) {
      fetchClasses();
    }
  }, [academyId]);

  useEffect(() => {
    if (!initialFocusClassId || guidedEditingClass) {
      return;
    }

    const target = classes.find((item) => item.id === initialFocusClassId);
    if (!target) {
      return;
    }

    setGuidedEditingClass(target);

    const params = new URLSearchParams(searchParams?.toString());
    params.delete("focusClass");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [classes, guidedEditingClass, initialFocusClassId, pathname, router, searchParams]);

  // Calcular estadísticas
  useEffect(() => {
    const totalClasses = classes.length;
    const withCapacity = classes.filter((c) => c.capacity && c.capacity > 0);
    const utilizedCapacity = withCapacity.reduce((acc, c) => {
      const enrollment = c.currentEnrollment ?? 0;
      const capacity = c.capacity ?? 1;
      return acc + (capacity > 0 ? (enrollment / capacity) * 100 : 0);
    }, 0);
    const utilizationRate = withCapacity.length > 0
      ? Math.round(utilizedCapacity / withCapacity.length)
      : 0;

    setStats({
      totalClasses,
      totalSessions: 0, // Se calcularía con datos de sesiones
      upcomingSessions: 0,
      utilizationRate,
    });
  }, [classes]);

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
      fetchClasses();
    });
  };

  const handleCreated = () => {
    setCreateOpen(false);
    handleRefresh();
  };

  const handleGuidedEdit = (classId: string) => {
    const target = classes.find((item) => item.id === classId) ?? null;
    setGuidedEditingClass(target);
  };

  return (
    <div className="space-y-6">
      {/* Header con stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title={`Total ${specialization.labels.classLabel}s`}
          value={stats.totalClasses}
          icon={<Calendar className="h-5 w-5" />}
          description={`${specialization.labels.classLabel}s configuradas`}
        />
        <StatsCard
          title={`${specialization.labels.sessionLabel}es este mes`}
          value={stats.totalSessions}
          icon={<Clock className="h-5 w-5" />}
          description={`${specialization.labels.classLabel}s programadas`}
        />
        <StatsCard
          title={`Próximas ${specialization.labels.sessionLabel.toLowerCase()}es`}
          value={stats.upcomingSessions}
          icon={<AlertCircle className="h-5 w-5" />}
          variant="warning"
        />
        <StatsCard
          title="Tasa de ocupación"
          value={`${stats.utilizationRate}%`}
          icon={<Users className="h-5 w-5" />}
          variant={stats.utilizationRate > 80 ? "success" : "default"}
        />
      </div>

      {starterClassCount > 0 && (
        <div className="space-y-4 rounded-2xl border border-zaltyko-teal/20 bg-zaltyko-teal/5 p-5 shadow-soft">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Ya tienes {starterClassCount} {starterClassCount === 1 ? specialization.labels.classLabel.toLowerCase() : `${specialization.labels.classLabel.toLowerCase()}s`} creadas desde la plantilla inicial
            </p>
            <p className="text-sm text-muted-foreground">
              Revísalas, ajusta horarios y asigna responsables para adaptarlas a la operativa real de tu academia.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-zaltyko-mist bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-slate-400">
                Listas para operar
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-zaltyko-navy">{starterSetup.readyCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {starterSetup.completionPercentage}% de la plantilla ya está afinada
              </p>
            </div>
            <div className="rounded-xl border border-zaltyko-mist bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-slate-400">
                Responsables pendientes
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-zaltyko-navy">{starterSetup.missingCoachCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {specialization.labels.coachLabel}s sin asignar en clases base
              </p>
            </div>
            <div className="rounded-xl border border-zaltyko-mist bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-slate-400">
                Horarios por cerrar
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-zaltyko-navy">{starterSetup.flexibleScheduleCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bloques con días u horas todavía abiertos
              </p>
            </div>
            <div className="rounded-xl border border-zaltyko-mist bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-slate-400">
                Estructura pendiente
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-zaltyko-navy">
                {starterSetup.missingTemplateCount + starterSetup.missingGroupCount + starterSetup.missingCapacityCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Entre plantillas no creadas, aforo o grupos por vincular
              </p>
            </div>
          </div>

          {(starterSetup.items.some((item) => !item.isReady) || starterSetup.missingTemplateCount > 0) && (
            <div className="rounded-xl border border-zaltyko-mist bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Puesta a punto guiada</p>
                  <p className="text-sm text-muted-foreground">
                    Empieza por las clases base que todavía necesitan ajustes.
                  </p>
                </div>
                <Button variant="outline" asChild>
                  <Link href={`/app/${academyId}/groups`}>
                    Revisar {specialization.labels.groupLabel.toLowerCase()}s
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {starterSetup.items
                  .filter((item) => !item.isReady)
                  .slice(0, 3)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-xl border border-dashed border-zaltyko-mist p-3 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="space-y-2">
                        <Link
                          href={`/app/${academyId}/classes/${item.id}`}
                          className="text-sm font-semibold text-zaltyko-teal hover:underline"
                        >
                          {item.name}
                        </Link>
                        <div className="flex flex-wrap gap-2">
                          {item.issues.map((issue) => (
                            <Badge key={issue} variant="outline" className="bg-white">
                              {issue}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => handleGuidedEdit(item.id)}>
                          Ajustar ahora
                        </Button>
                        <Button variant="outline" asChild>
                          <Link href={`/app/${academyId}/classes/${item.id}`}>Abrir ficha</Link>
                        </Button>
                      </div>
                    </div>
                  ))}

                {starterSetup.missingTemplateNames.slice(0, 2).map((name) => (
                  <div
                    key={name}
                    className="flex flex-col gap-3 rounded-xl border border-dashed border-zaltyko-mist p-3 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{name}</p>
                      <p className="text-sm text-muted-foreground">
                        Esta clase sugerida de la plantilla inicial aún no se ha creado.
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => setCreateOpen(true)}>
                      Crear {specialization.labels.classLabel.toLowerCase()}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setCreateOpen(true)}>
          Nuevo {specialization.labels.classLabel}
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/app/${academyId}/classes?view=calendar`}>
            <Calendar className="mr-2 h-4 w-4" />
            Ver calendario
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/app/${academyId}/groups`}>
            <Users className="mr-2 h-4 w-4" />
            Gestionar {specialization.labels.groupLabel.toLowerCase()}s
          </Link>
        </Button>
      </div>

      {/* Tabla de clases */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ClassesTableView
          academyId={academyId}
          classes={classes}
          availableCoaches={availableCoaches}
          groupOptions={groupOptions}
          filters={{}}
        />
      )}

      <CreateClassDialog
        academyId={academyId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      {guidedEditingClass && (
        <EditClassDialog
          classItem={guidedEditingClass}
          availableCoaches={availableCoaches}
          availableGroups={groupOptions}
          open={Boolean(guidedEditingClass)}
          onClose={() => setGuidedEditingClass(null)}
          onUpdated={() => {
            setGuidedEditingClass(null);
            handleRefresh();
          }}
          academyId={academyId}
        />
      )}
    </div>
  );
}
