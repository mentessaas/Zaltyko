"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";

interface ClassItem {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
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
    default: "bg-card border-border",
    success: "bg-emerald-50/50 border-emerald-200",
    warning: "bg-amber-50/50 border-amber-200",
    danger: "bg-red-50/50 border-red-200",
  };

  const iconStyles = {
    default: "text-primary",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1 text-xs">
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              <span className="text-emerald-600">{trend.value}%</span>
              <span className="text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={`rounded-full p-2 ${variantStyles[variant]}`}>
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
}

export function ClassesDashboard({
  academyId,
  initialClasses = [],
  availableCoaches,
  groupOptions,
}: ClassesDashboardProps) {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassItem[]>(initialClasses);
  const [stats, setStats] = useState({
    totalClasses: 0,
    totalSessions: 0,
    upcomingSessions: 0,
    utilizationRate: 0,
  });
  const [isLoading, setIsLoading] = useState(initialClasses.length === 0);
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

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

  return (
    <div className="space-y-6">
      {/* Header con stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Clases"
          value={stats.totalClasses}
          icon={<Calendar className="h-5 w-5" />}
          description="Clases configuradas"
        />
        <StatsCard
          title="Sesiones este mes"
          value={stats.totalSessions}
          icon={<Clock className="h-5 w-5" />}
          description="Clases programadas"
        />
        <StatsCard
          title="Próximas sesiones"
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

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setCreateOpen(true)}>
          Nueva clase
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/classes?academy=${academyId}&view=calendar`}>
            <Calendar className="mr-2 h-4 w-4" />
            Ver calendario
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/classes/${academyId}/groups`}>
            <Users className="mr-2 h-4 w-4" />
            Gestionar grupos
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
    </div>
  );
}
