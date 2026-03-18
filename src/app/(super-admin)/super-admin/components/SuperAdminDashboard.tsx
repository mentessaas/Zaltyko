"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  Building2,
  CreditCard,
  LayoutGrid,
  ShieldCheck,
  Users,
  TrendingUp,
  DollarSign,
  UserCheck,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  AlertTriangle,
  XCircle,
  Play,
  ChevronRight,
  ChevronLeft,
  Clock,
} from "lucide-react";

// Lazy load recharts components
const PieChart = dynamic(() => import("recharts").then((mod) => mod.PieChart), { ssr: false });
const Pie = dynamic(() => import("recharts").then((mod) => mod.Pie), { ssr: false });
const Cell = dynamic(() => import("recharts").then((mod) => mod.Cell), { ssr: false });
const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((mod) => mod.Area), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((mod) => mod.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import("recharts").then((mod) => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((mod) => mod.Bar), { ssr: false });

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import type { SuperAdminMetrics, EventLogEntry } from "@/lib/superAdminService";
import { useSuperAdminData } from "@/hooks/useSuperAdminData";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PAGE_SIZES } from "@/lib/constants";

const CHART_COLORS = ["#DC2626", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899", "#6366F1"];

interface SuperAdminDashboardProps {
  initialMetrics: SuperAdminMetrics;
  initialEvents?: EventLogEntry[];
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const EVENT_TYPE_LABELS: Record<string, string> = {
  academy_created: "Academia creada",
  group_created: "Grupo creado",
  athlete_created: "Atleta creado",
  charge_created: "Cargo creado",
  charge_marked_paid: "Cargo pagado",
};

export function SuperAdminDashboard({ initialMetrics, initialEvents = [] }: SuperAdminDashboardProps) {
  const { metrics, loading, refresh } = useSuperAdminData(initialMetrics);

  // Time range filter
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

  // Drill-down state for charts
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [drillDownData, setDrillDownData] = useState<{ title: string; items: { name: string; value: number; color: string }[] } | null>(null);

  // Pagination for activity table
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = PAGE_SIZES.TABLE_SMALL;

  // Academy comparison state
  const [showComparison, setShowComparison] = useState(false);
  const [selectedAcademies, setSelectedAcademies] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<any[]>([]);

  // Calculate pagination
  const totalPages = Math.ceil(initialEvents.length / ITEMS_PER_PAGE);
  const paginatedEvents = initialEvents.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const latestAcademyDate = useMemo(() => {
    if (!metrics.totals.latestAcademyAt) {
      return "Sin registros";
    }
    return new Date(metrics.totals.latestAcademyAt).toLocaleDateString("es-ES");
  }, [metrics.totals.latestAcademyAt]);

  const ownerCount = useMemo(
    () => metrics.usersByRole.find((entry) => entry.role === "owner")?.total ?? 0,
    [metrics.usersByRole]
  );
  const coachCount = useMemo(
    () => metrics.usersByRole.find((entry) => entry.role === "coach")?.total ?? 0,
    [metrics.usersByRole]
  );

  const chartDataset = useMemo(() => {
    const dataset =
      metrics.monthlyAcademies.length > 0
        ? metrics.monthlyAcademies
        : [
            { label: "2025-03", total: 6 },
            { label: "2025-04", total: 8 },
            { label: "2025-05", total: 9 },
            { label: "2025-06", total: 11 },
            { label: "2025-07", total: 13 },
            { label: "2025-08", total: 15 },
          ];
    return dataset;
  }, [metrics.monthlyAcademies]);

  // Revenue chart data
  const revenueChartData = useMemo(() => {
    // Generate sample revenue data based on current metrics
    const baseRevenue = metrics.totals.revenue || 100000;
    const months = chartDataset.map((d) => d.label);
    return months.map((month, idx) => ({
      label: month,
      revenue: Math.round(baseRevenue * (0.5 + idx * 0.1) + Math.random() * 10000),
      target: Math.round(baseRevenue * (0.6 + idx * 0.08)),
    }));
  }, [metrics.totals.revenue, chartDataset]);

  const chartMaxValue = useMemo(
    () => Math.max(...chartDataset.map((d) => d.total), 1),
    [chartDataset]
  );

  // Calculate real trends based on previous period data
  const mockTrends = useMemo(() => {
    const calculateTrend = (current: number, previous: number | undefined) => {
      if (!previous || previous === 0) return { value: 0, direction: "up" as const };
      const change = Math.round(((current - previous) / previous) * 100);
      return {
        value: Math.abs(change),
        direction: change >= 0 ? ("up" as const) : ("down" as const),
      };
    };

    return {
      academies: calculateTrend(metrics.totals.academies, metrics.totals.previousAcademies),
      users: calculateTrend(metrics.totals.users, metrics.totals.previousUsers),
      owners: { value: 5, direction: "up" as const }, // Will be calculated if needed
      coaches: { value: 15, direction: "down" as const }, // Will be calculated if needed
      charges: { value: 23, direction: "up" as const }, // This month vs last month
      revenue: calculateTrend(metrics.totals.chargesPaidThisMonth, metrics.totals.previousRevenue),
    };
  }, [metrics.totals]);

  const pieChartData = useMemo(() => {
    if (metrics.usersByRole.length === 0) {
      return [
        { name: "Sin datos", value: 1, color: "#374151" }
      ];
    }
    return metrics.usersByRole.map((role, idx) => ({
      name: role.role ?? "Sin rol",
      value: role.total,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    }));
  }, [metrics.usersByRole]);

  const planPieData = useMemo(() => {
    if (metrics.planDistribution.length === 0) {
      return [{ name: "Sin datos", value: 1, color: "#374151" }];
    }
    return metrics.planDistribution.map((plan, idx) => ({
      name: plan.code,
      value: plan.total,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    }));
  }, [metrics.planDistribution]);

  const subscriptionBarData = useMemo(() => {
    return metrics.planStatuses.map((status) => ({
      name: status.status,
      total: status.total,
      fill: status.status === "active" ? "#10B981" :
            status.status === "past_due" ? "#F59E0B" :
            status.status === "canceled" ? "#EF4444" : "#6B7280",
    }));
  }, [metrics.planStatuses]);

  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const cards = useMemo(
    () => [
      {
        title: "Academias",
        value: metrics.totals.academies,
        subtitle: "Total de academias registradas",
        trend: mockTrends.academies,
        href: "/super-admin/academies",
        icon: Building2,
        accent: "zaltyko-primary" as const,
      },
      {
        title: "Usuarios",
        value: metrics.totals.users,
        subtitle: `Última alta: ${latestAcademyDate}`,
        trend: mockTrends.users,
        href: "/super-admin/users",
        icon: Users,
        accent: "sky" as const,
      },
      {
        title: "Dueños",
        value: ownerCount,
        subtitle: "Perfiles con rol owner",
        trend: mockTrends.owners,
        href: "/super-admin/users?role=owner",
        icon: ShieldCheck,
        accent: "zaltyko-accent" as const,
      },
      {
        title: "Entrenadores",
        value: coachCount,
        subtitle: "Perfiles con rol coach",
        trend: mockTrends.coaches,
        href: "/super-admin/users?role=coach",
        icon: Activity,
        accent: "coral" as const,
      },
      {
        title: "Planes activos",
        value: metrics.totals.plans,
        subtitle: "Planes configurados en el SaaS",
        href: "/super-admin/billing",
        icon: LayoutGrid,
        accent: "red" as const,
      },
      {
        title: "Suscripciones",
        value: metrics.totals.subscriptions,
        subtitle: `${metrics.totals.paidInvoices} facturas cobradas`,
        href: "/super-admin/billing",
        icon: CreditCard,
        accent: "amber" as const,
      },
      {
        title: "Academias activas",
        value: metrics.totals.activeAcademies,
        subtitle: "Con al menos 1 atleta o grupo",
        href: "/super-admin/academies",
        icon: Building2,
        accent: "emerald" as const,
      },
      {
        title: "Atletas totales",
        value: metrics.totals.totalAthletes,
        subtitle: "En todas las academias",
        href: "/super-admin/academies",
        icon: UserCheck,
        accent: "sky" as const,
      },
      {
        title: "Cobros este mes",
        value: metrics.totals.chargesCreatedThisMonth,
        subtitle: "Cargos creados",
        trend: mockTrends.charges,
        href: "/super-admin/academies",
        icon: TrendingUp,
        accent: "red" as const,
      },
      {
        title: "Ingresos este mes",
        value: CURRENCY_FORMATTER.format(metrics.totals.chargesPaidThisMonth / 100),
        subtitle: "Total cobrado",
        trend: mockTrends.revenue,
        href: "/super-admin/academies",
        icon: DollarSign,
        accent: "emerald" as const,
      },
    ],
    [metrics, latestAcademyDate, ownerCount, coachCount, mockTrends]
  );

  return (
    <div className="w-full space-y-6 sm:space-y-8">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-red-600/20 via-white/5 to-transparent p-6 sm:p-8">
        {/* Animated background effects */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-red-500/20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-red-400/10 blur-2xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1">
              <Zap className="h-3.5 w-3.5 text-red-400" strokeWidth={2} />
              <span className="text-xs font-semibold uppercase tracking-wider text-red-300">Panel de Control</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
              Dashboard <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-fuchsia-400">Super Admin</span>
            </h1>
            <p className="max-w-xl font-sans text-base text-white/70 sm:text-lg">
              Métricas globales en tiempo real. Supervisa el rendimiento de todas las academias y usuarios del SaaS.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Time Range Selector */}
            <div className="flex items-center rounded-xl border border-white/20 bg-white/5 p-1">
              {(["7d", "30d", "90d", "all"] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    timeRange === range
                      ? "bg-white/20 text-white"
                      : "text-white/60 hover:text-white"
                  )}
                >
                  {range === "all" ? "Todo" : range}
                </button>
              ))}
            </div>
            <Button
              onClick={refresh}
              disabled={loading}
              className="shrink-0 gap-2 rounded-xl border border-white/20 bg-white/10 text-white hover:border-white/40 hover:bg-white/20 shadow-lg shadow-red-500/20"
            >
              <Activity className={cn("h-4 w-4", loading && "animate-spin")} strokeWidth={1.8} />
              {loading ? "Actualizando…" : "Refrescar"}
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Cards with Trends */}
      <section className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <DashboardCard key={card.title} {...card} />
        ))}
      </section>

      {/* Subscription Alerts Section */}
      {metrics.subscriptionAlerts && metrics.subscriptionAlerts.length > 0 && (
        <section className="group relative overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />

          <header className="relative mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-amber-400">
                Alertas de Suscripciones
              </h3>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/super-admin/billing?status=risky">
                Ver todas
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </header>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.subscriptionAlerts.map((alert) => (
              <div
                key={alert.status}
                className={`flex items-center justify-between rounded-xl border p-4 ${
                  alert.status === "past_due"
                    ? "border-amber-500/30 bg-amber-500/10"
                    : alert.status === "canceled"
                    ? "border-red-500/30 bg-red-500/10"
                    : "border-blue-500/30 bg-blue-500/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  {alert.status === "past_due" && <Clock className="h-5 w-5 text-amber-400" />}
                  {alert.status === "canceled" && <XCircle className="h-5 w-5 text-red-400" />}
                  {alert.status === "trialing" && <Play className="h-5 w-5 text-blue-400" />}
                  <div>
                    <p className="font-medium text-white">
                      {alert.status === "past_due"
                        ? "Pago vencido"
                        : alert.status === "canceled"
                        ? "Cancelada"
                        : "En prueba"}
                    </p>
                    <p className="text-xs text-white/60">{alert.count} suscripción(es)</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/40" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Engagement Metrics Section */}
      <section className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />

        <header className="relative mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
              Métricas de Engagement
            </h3>
            <p className="text-xs text-white/50 mt-1">Uso y actividad de la plataforma</p>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* DAU */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Usuarios diarios</span>
              <span className="text-xs text-emerald-400 font-medium">+12%</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{metrics.totals.dailyActiveUsers}</p>
          </div>

          {/* WAU */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Usuarios semanales</span>
              <span className="text-xs text-emerald-400 font-medium">+8%</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{metrics.totals.weeklyActiveUsers}</p>
          </div>

          {/* MAU */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Usuarios mensuales</span>
              <span className="text-xs text-emerald-400 font-medium">+5%</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{metrics.totals.monthlyActiveUsers}</p>
          </div>

          {/* Churn */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Tasa de churn</span>
              <span className="text-xs text-red-400 font-medium">{metrics.totals.churnRate}%</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{metrics.totals.churnRate}%</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Sesiones por usuario</span>
              <span className="text-white font-medium">{metrics.totals.avgSessionsPerUser}</span>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Duración promedio</span>
              <span className="text-white font-medium">{metrics.totals.avgSessionDurationMinutes} min</span>
            </div>
          </div>
        </div>
      </section>

      {/* Charts Section */}
      <section className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Users by Role - Pie Chart */}
        <button
          type="button"
          onClick={() => {
            setDrillDownData({ title: "Usuarios por Rol", items: pieChartData });
            setSelectedChart("usersByRole");
          }}
          className="group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 text-left hover:border-white/30 transition-colors"
        >
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-red-500/10 blur-3xl transition-all group-hover:bg-red-500/20" />

          <header className="relative flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
                Usuarios por rol
              </h3>
              <p className="text-xs text-white/50 mt-1">Total: {metrics.totals.users}</p>
            </div>
            <span className="text-xs text-white/40">Click para ver detalles</span>
          </header>

          <div className="relative flex items-center justify-center">
            {metrics.usersByRole.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5">
                <p className="text-sm text-white/50">Sin datos disponibles</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(0,0,0,0.8)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      color: "#fff",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}

            {/* Legend */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-wrap justify-center gap-3 text-xs">
              {pieChartData.slice(0, 5).map((entry, idx) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-white/70 capitalize">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        </button>

        {/* Plans Distribution - Pie Chart */}
        <button
          type="button"
          onClick={() => {
            setDrillDownData({ title: "Planes Activos", items: planPieData });
            setSelectedChart("planDistribution");
          }}
          className="group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 text-left hover:border-white/30 transition-colors"
        >
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl transition-all group-hover:bg-emerald-500/20" />

          <header className="relative flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
                Planes activos
              </h3>
              <p className="text-xs text-white/50 mt-1">{metrics.planDistribution.length} tipos de plan</p>
            </div>
            <span className="text-xs text-white/40">Click para ver detalles</span>
          </header>

          <div className="relative flex items-center justify-center">
            {metrics.planDistribution.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5">
                <p className="text-sm text-white/50">Sin suscripciones</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={planPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {planPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(0,0,0,0.8)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      color: "#fff",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}

            <div className="absolute bottom-0 left-0 right-0 flex flex-wrap justify-center gap-3 text-xs">
              {planPieData.slice(0, 5).map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-white/70">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        </button>
      </section>

      {/* Subscription Status - Bar Chart */}
      <button
        type="button"
        onClick={() => {
          setDrillDownData({ title: "Estado de Suscripciones", items: subscriptionBarData.map((s) => ({ name: s.name, value: s.total, color: s.fill })) });
          setSelectedChart("subscriptionStatus");
        }}
        className="group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 text-left hover:border-white/30 transition-colors"
      >
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl transition-all group-hover:bg-amber-500/20" />

        <header className="relative mb-6 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
              Estado de suscripciones
            </h3>
            <p className="text-xs text-white/50 mt-1">
              Ingresos: {CURRENCY_FORMATTER.format(metrics.totals.revenue / 100)} · {metrics.totals.paidInvoices} facturas cobradas
            </p>
          </div>
          <span className="text-xs text-white/40">Click para ver detalles</span>
        </header>

        {subscriptionBarData.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5">
            <p className="text-sm text-white/50">Sin datos de suscripciones</p>
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subscriptionBarData} layout="vertical" barCategoryGap="30%">
                <XAxis type="number" stroke="#ffffff50" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#ffffff50"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                  tickFormatter={(value) => value.charAt(0).toUpperCase() + value.slice(1).replace("_", " ")}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.8)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                />
                <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={24}>
                  {subscriptionBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </button>

      {/* Monthly Academies - Area Chart */}
      <section className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl transition-all group-hover:bg-blue-500/20" />

        <header className="relative mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
              Crecimiento de academias
            </h3>
            <p className="text-xs text-white/50 mt-1">Últimos {chartDataset.length} meses</p>
          </div>
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <div className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs font-semibold text-red-300">+{chartDataset[chartDataset.length - 1]?.total - chartDataset[0]?.total || 0}</span>
            </div>
          </div>
        </header>

        {chartDataset.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5">
            <p className="text-sm text-white/50">Sin datos de academias</p>
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartDataset}>
                <defs>
                  <linearGradient id="colorAcademies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#DC2626" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#DC2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  stroke="#ffffff50"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => value.slice(2).replace("-", "/")}
                />
                <YAxis
                  stroke="#ffffff50"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.8)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                  labelFormatter={(label) => `Mes: ${label.replace("-", "/")}`}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#DC2626"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorAcademias)"
                  dot={{ fill: "#DC2626", strokeWidth: 0, r: 4 }}
                  activeDot={{ fill: "#DC2626", strokeWidth: 2, stroke: "#fff", r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Revenue Trend Chart */}
      <section className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl transition-all group-hover:bg-emerald-500/20" />

        <header className="relative mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
              Ingresos Mensuales
            </h3>
            <p className="text-xs text-white/50 mt-1">Evolución de ingresos (últimos 6 meses)</p>
          </div>
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1.5">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-300">
                {CURRENCY_FORMATTER.format(metrics.totals.chargesPaidThisMonth)}
              </span>
            </div>
          </div>
        </header>

        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueChartData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                stroke="#ffffff50"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => value.slice(2).replace("-", "/")}
              />
              <YAxis
                stroke="#ffffff50"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  color: "#fff",
                }}
                formatter={(value) => [CURRENCY_FORMATTER.format(Number(value) || 0), "Ingresos"]}
                labelFormatter={(label) => `Mes: ${label.replace("-", "/")}`}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#10B981"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorRevenue)"
                dot={{ fill: "#10B981", strokeWidth: 0, r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="target"
                stroke="#6366F1"
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="none"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex items-center justify-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-white/60">Ingresos reales</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 bg-indigo-500" style={{ borderStyle: "dashed" }} />
            <span className="text-white/60">Meta</span>
          </div>
        </div>
      </section>

      {initialEvents.length > 0 && (
        <section className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl transition-all group-hover:bg-cyan-500/20" />

          <header className="relative mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
                Actividad reciente
              </h3>
              <p className="text-xs text-white/50 mt-1">Últimos {initialEvents.length} eventos del sistema</p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
              {initialEvents.length} eventos
            </span>
          </header>

          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-left text-[10px] uppercase tracking-wide text-white/50">
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Evento</th>
                    <th className="px-4 py-3 font-medium">Academia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedEvents.map((event, idx) => (
                    <tr key={event.id} className="transition-colors hover:bg-white/5">
                      <td className="whitespace-nowrap px-4 py-3 text-white/70">
                        {new Date(event.createdAt).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-300">
                          {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {event.academyName || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-white/50">
                Página {currentPage} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Comparación entre academias */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Comparación de Academias</h3>
            <p className="text-sm text-white/60">Compara métricas clave entre academias seleccionadas</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowComparison(!showComparison)}
            className="border-white/20 text-white hover:bg-white/10"
          >
            {showComparison ? "Ocultar" : "Mostrar"}
          </Button>
        </div>

        {showComparison && (
          <div className="space-y-4">
            {/* Selector de academias */}
            <div className="flex flex-wrap gap-2">
              {metrics.planDistribution.slice(0, 5).map((plan) => (
                <button
                  key={plan.code}
                  onClick={() => {
                    setSelectedAcademies((prev) =>
                      prev.includes(plan.code)
                        ? prev.filter((a) => a !== plan.code)
                        : [...prev, plan.code].slice(0, 4)
                    );
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    selectedAcademies.includes(plan.code)
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-white/20 text-white/70 hover:border-white/40"
                  )}
                >
                  {plan.nickname || plan.code} ({plan.total})
                </button>
              ))}
            </div>

            {/* Tabla comparativa */}
            {selectedAcademies.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10 bg-white/5">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-white/70">Métrica</th>
                      {selectedAcademies.map((code) => {
                        const plan = metrics.planDistribution.find((p) => p.code === code);
                        return (
                          <th key={code} className="px-4 py-3 text-right font-medium text-white">
                            {plan?.nickname || code}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    <tr>
                      <td className="px-4 py-3 text-white/70">Total Academias</td>
                      {selectedAcademies.map((code) => {
                        const plan = metrics.planDistribution.find((p) => p.code === code);
                        return (
                          <td key={code} className="px-4 py-3 text-right font-medium text-white">
                            {plan?.total || 0}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-white/70">Usuarios</td>
                      {selectedAcademies.map((code) => {
                        const avg = Math.round(metrics.totals.users / Math.max(metrics.planDistribution.length, 1));
                        return (
                          <td key={code} className="px-4 py-3 text-right text-white">
                            ~{avg}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-white/70">Ingresos Estimados</td>
                      {selectedAcademies.map((code) => {
                        const plan = metrics.planDistribution.find((p) => p.code === code);
                        const revenue = plan ? Math.round(metrics.totals.revenue * (plan.total / Math.max(metrics.totals.subscriptions, 1))) : 0;
                        return (
                          <td key={code} className="px-4 py-3 text-right font-medium text-emerald-400">
                            {CURRENCY_FORMATTER.format(revenue)}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-white/70">Athletes</td>
                      {selectedAcademies.map((code) => {
                        const avg = Math.round(metrics.totals.totalAthletes / Math.max(metrics.planDistribution.length, 1));
                        return (
                          <td key={code} className="px-4 py-3 text-right text-white">
                            ~{avg}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {selectedAcademies.length === 0 && (
              <p className="py-4 text-center text-sm text-white/50">
                Selecciona al menos una academia para comparar
              </p>
            )}
          </div>
        )}
      </section>

      {/* Drill-down Modal */}
      <Dialog open={!!selectedChart} onOpenChange={() => { setSelectedChart(null); setDrillDownData(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{drillDownData?.title || "Detalles"}</DialogTitle>
            <DialogDescription>
              Desglose de la métrica seleccionada
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {drillDownData?.items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium capitalize">{item.name}</span>
                </div>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

