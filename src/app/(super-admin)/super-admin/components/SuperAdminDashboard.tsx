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
import { normalizeSuperAdminMetrics } from "@/lib/super-admin-metrics";
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

const CHART_COLORS = ["#1FC7B6", "#2B2E83", "#CBD5E1", "#FF6B57", "#0F172A", "#5CE0D4", "#818CF8"];

interface SuperAdminDashboardProps {
  initialMetrics: SuperAdminMetrics;
  initialEvents?: EventLogEntry[];
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
});

const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
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
  const safeMetrics = useMemo(() => normalizeSuperAdminMetrics(metrics), [metrics]);

  // Drill-down state for charts
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [drillDownData, setDrillDownData] = useState<{ title: string; items: { name: string; value: number; color: string }[] } | null>(null);

  // Pagination for activity table
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = PAGE_SIZES.TABLE_SMALL;

  // Calculate pagination
  const totalPages = Math.ceil(initialEvents.length / ITEMS_PER_PAGE);
  const paginatedEvents = initialEvents.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const latestAcademyDate = useMemo(() => {
    if (!safeMetrics.totals.latestAcademyAt) {
      return "Sin registros";
    }
    const parsedDate = new Date(safeMetrics.totals.latestAcademyAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return "Sin registros";
    }
    return DATE_FORMATTER.format(parsedDate);
  }, [safeMetrics.totals.latestAcademyAt]);

  const ownerCount = useMemo(
    () => safeMetrics.usersByRole.find((entry) => entry.role === "owner")?.total ?? 0,
    [safeMetrics.usersByRole]
  );
  const coachCount = useMemo(
    () => safeMetrics.usersByRole.find((entry) => entry.role === "coach")?.total ?? 0,
    [safeMetrics.usersByRole]
  );

  const chartDataset = useMemo(() => {
    return safeMetrics.monthlyAcademies;
  }, [safeMetrics.monthlyAcademies]);

  const trends = useMemo(() => {
    const calculateTrend = (current: number, previous: number | undefined) => {
      if (previous === undefined || previous === 0) return undefined;
      const change = Math.round(((current - previous) / previous) * 100);
      return {
        value: Math.abs(change),
        direction: change >= 0 ? ("up" as const) : ("down" as const),
      };
    };

    return {
      academies: calculateTrend(safeMetrics.totals.academies, safeMetrics.totals.previousAcademies),
      users: calculateTrend(safeMetrics.totals.users, safeMetrics.totals.previousUsers),
      revenue: calculateTrend(safeMetrics.totals.chargesPaidThisMonth, safeMetrics.totals.previousRevenue),
    };
  }, [safeMetrics.totals]);

  const pieChartData = useMemo(() => {
    if (safeMetrics.usersByRole.length === 0) {
      return [
        { name: "Sin datos", value: 1, color: "#374151" }
      ];
    }
    return safeMetrics.usersByRole.map((role, idx) => ({
      name: role.role ?? "Sin rol",
      value: role.total,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    }));
  }, [safeMetrics.usersByRole]);

  const planPieData = useMemo(() => {
    if (safeMetrics.planDistribution.length === 0) {
      return [{ name: "Sin datos", value: 1, color: "#374151" }];
    }
    return safeMetrics.planDistribution.map((plan, idx) => ({
      name: plan.code,
      value: plan.total,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    }));
  }, [safeMetrics.planDistribution]);

  const subscriptionBarData = useMemo(() => {
    return safeMetrics.planStatuses.map((status) => ({
      name: status.status,
      total: status.total,
      fill: status.status === "active" ? "#10B981" :
            status.status === "past_due" ? "#F59E0B" :
            status.status === "canceled" ? "#EF4444" : "#6B7280",
    }));
  }, [safeMetrics.planStatuses]);

  const cards = useMemo(
    () => [
      {
        title: "Academias",
        value: safeMetrics.totals.academies,
        subtitle: "Total de academias registradas",
        trend: trends.academies,
        href: "/super-admin/academies",
        icon: Building2,
        accent: "zaltyko-primary" as const,
      },
      {
        title: "Usuarios",
        value: safeMetrics.totals.users,
        subtitle: `Última alta: ${latestAcademyDate}`,
        trend: trends.users,
        href: "/super-admin/users",
        icon: Users,
        accent: "sky" as const,
      },
      {
        title: "Dueños",
        value: ownerCount,
        subtitle: "Perfiles con rol owner",
        href: "/super-admin/users?role=owner",
        icon: ShieldCheck,
        accent: "zaltyko-accent" as const,
      },
      {
        title: "Entrenadores",
        value: coachCount,
        subtitle: "Perfiles con rol coach",
        href: "/super-admin/users?role=coach",
        icon: Activity,
        accent: "coral" as const,
      },
      {
        title: "Planes activos",
        value: safeMetrics.totals.plans,
        subtitle: "Planes configurados en el SaaS",
        href: "/super-admin/dashboard",
        icon: LayoutGrid,
        accent: "red" as const,
      },
      {
        title: "Suscripciones",
        value: safeMetrics.totals.subscriptions,
        subtitle: `${safeMetrics.totals.paidInvoices} facturas cobradas`,
        href: "/super-admin/dashboard",
        icon: CreditCard,
        accent: "amber" as const,
      },
      {
        title: "Academias activas",
        value: safeMetrics.totals.activeAcademies,
        subtitle: "Con al menos 1 atleta o grupo",
        href: "/super-admin/academies",
        icon: Building2,
        accent: "emerald" as const,
      },
      {
        title: "Atletas totales",
        value: safeMetrics.totals.totalAthletes,
        subtitle: "En todas las academias",
        href: "/super-admin/academies",
        icon: UserCheck,
        accent: "sky" as const,
      },
      {
        title: "Cobros este mes",
        value: safeMetrics.totals.chargesCreatedThisMonth,
        subtitle: "Cargos creados",
        href: "/super-admin/academies",
        icon: TrendingUp,
        accent: "red" as const,
      },
      {
        title: "Ingresos este mes",
        value: CURRENCY_FORMATTER.format(safeMetrics.totals.chargesPaidThisMonth / 100),
        subtitle: "Total cobrado",
        trend: trends.revenue,
        href: "/super-admin/academies",
        icon: DollarSign,
        accent: "emerald" as const,
      },
    ],
    [safeMetrics, latestAcademyDate, ownerCount, coachCount, trends]
  );

  return (
    <div className="w-full space-y-6 sm:space-y-8">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zaltyko-indigo/25 via-white/5 to-zaltyko-teal/10 p-6 sm:p-8">
        {/* Animated background effects */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-zaltyko-indigo/20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-zaltyko-teal/15 blur-2xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-zaltyko-teal/30 bg-zaltyko-teal/10 px-3 py-1">
              <Zap className="h-3.5 w-3.5 text-zaltyko-teal" strokeWidth={2} />
              <span className="text-xs font-semibold uppercase tracking-wider text-zaltyko-teal">Panel de Control</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
              Dashboard <span className="text-transparent bg-clip-text bg-gradient-to-r from-zaltyko-white via-zaltyko-teal to-zaltyko-teal">Super Admin</span>
            </h1>
            <p className="max-w-xl font-sans text-base text-white/70 sm:text-lg">
              Métricas globales derivadas de los datos registrados en Zaltyko.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={refresh}
              disabled={loading}
              className="shrink-0 gap-2 rounded-xl border border-white/20 bg-white/10 text-white shadow-soft hover:border-white/40 hover:bg-white/20"
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
      {safeMetrics.subscriptionAlerts && safeMetrics.subscriptionAlerts.length > 0 && (
        <section className="group relative overflow-hidden rounded-2xl border border-zaltyko-coral/25 bg-zaltyko-coral/8 p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-zaltyko-coral/10 blur-3xl" />

          <header className="relative mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-zaltyko-coral" />
              <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-coral">
                Alertas de Suscripciones
              </h3>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {safeMetrics.subscriptionAlerts.map((alert) => (
              <div
                key={alert.status}
                className={`flex items-center justify-between rounded-xl border p-4 ${
                  alert.status === "past_due"
                    ? "border-zaltyko-coral/30 bg-zaltyko-coral/10"
                    : alert.status === "canceled"
                    ? "border-zaltyko-coral/30 bg-zaltyko-coral/10"
                    : "border-zaltyko-teal/30 bg-zaltyko-teal/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  {alert.status === "past_due" && <Clock className="h-5 w-5 text-zaltyko-coral" />}
                  {alert.status === "canceled" && <XCircle className="h-5 w-5 text-zaltyko-coral" />}
                  {alert.status === "trialing" && <Play className="h-5 w-5 text-zaltyko-teal" />}
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
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-zaltyko-indigo/10 blur-3xl transition-all group-hover:bg-zaltyko-indigo/20" />

          <header className="relative flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
                Usuarios por rol
              </h3>
              <p className="text-xs text-white/50 mt-1">Total: {safeMetrics.totals.users}</p>
            </div>
            <span className="text-xs text-white/40">Click para ver detalles</span>
          </header>

          <div className="relative flex items-center justify-center">
            {safeMetrics.usersByRole.length === 0 ? (
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
              <p className="text-xs text-white/50 mt-1">{safeMetrics.planDistribution.length} tipos de plan</p>
            </div>
            <span className="text-xs text-white/40">Click para ver detalles</span>
          </header>

          <div className="relative flex items-center justify-center">
            {safeMetrics.planDistribution.length === 0 ? (
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
              Ingresos: {CURRENCY_FORMATTER.format(safeMetrics.totals.revenue / 100)} · {safeMetrics.totals.paidInvoices} facturas cobradas
            </p>
          </div>
          <span className="text-xs text-white/40">Click para ver detalles</span>
        </header>

        {subscriptionBarData.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5">
            <p className="text-sm text-white/50">Sin datos de suscripciones</p>
          </div>
        ) : (
          <div className="h-48 min-w-0">
            <ResponsiveContainer width="100%" height={192}>
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
            <div className="flex items-center gap-1.5 rounded-full bg-zaltyko-teal/15 px-3 py-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-zaltyko-teal" />
              <span className="text-xs font-semibold text-zaltyko-teal">+{chartDataset[chartDataset.length - 1]?.total - chartDataset[0]?.total || 0}</span>
            </div>
          </div>
        </header>

        {chartDataset.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5">
            <p className="text-sm text-white/50">Sin datos de academias</p>
          </div>
        ) : (
          <div className="h-56 min-w-0">
            <ResponsiveContainer width="100%" height={224}>
              <AreaChart data={chartDataset}>
                <defs>
                  <linearGradient id="colorAcademies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1FC7B6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#1FC7B6" stopOpacity={0} />
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
                  stroke="#1FC7B6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorAcademies)"
                  dot={{ fill: "#1FC7B6", strokeWidth: 0, r: 4 }}
                  activeDot={{ fill: "#1FC7B6", strokeWidth: 2, stroke: "#fff", r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
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
                        {EVENT_DATE_FORMATTER.format(new Date(event.createdAt))}
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
