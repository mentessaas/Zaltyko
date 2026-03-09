"use client";

import { useMemo } from "react";
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
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import type { SuperAdminMetrics, EventLogEntry } from "@/lib/superAdminService";
import { useSuperAdminData } from "@/hooks/useSuperAdminData";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CHART_COLORS = ["#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899", "#6366F1"];

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

  const chartMaxValue = useMemo(
    () => Math.max(...chartDataset.map((d) => d.total), 1),
    [chartDataset]
  );

  // Calculate mock trends for demo (in production, compare with previous period)
  const mockTrends = useMemo(() => ({
    academies: { value: 12, direction: "up" as const },
    users: { value: 8, direction: "up" as const },
    owners: { value: 5, direction: "up" as const },
    coaches: { value: 15, direction: "down" as const },
    charges: { value: 23, direction: "up" as const },
    revenue: { value: 18, direction: "up" as const },
  }), []);

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
        accent: "violet" as const,
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
        accent: "violet" as const,
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
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/20 via-white/5 to-transparent p-6 sm:p-8">
        {/* Animated background effects */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-violet-400/10 blur-2xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1">
              <Zap className="h-3.5 w-3.5 text-violet-400" strokeWidth={2} />
              <span className="text-xs font-semibold uppercase tracking-wider text-violet-300">Panel de Control</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
              Dashboard <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">Super Admin</span>
            </h1>
            <p className="max-w-xl font-sans text-base text-white/70 sm:text-lg">
              Métricas globales en tiempo real. Supervisa el rendimiento de todas las academias y usuarios del SaaS.
            </p>
          </div>
          <Button
            onClick={refresh}
            disabled={loading}
            className="shrink-0 gap-2 rounded-xl border border-white/20 bg-white/10 text-white hover:border-white/40 hover:bg-white/20 shadow-lg shadow-violet-500/20"
          >
            <Activity className={cn("h-4 w-4", loading && "animate-spin")} strokeWidth={1.8} />
            {loading ? "Actualizando…" : "Refrescar"}
          </Button>
        </div>
      </section>

      {/* Stats Cards with Trends */}
      <section className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <DashboardCard key={card.title} {...card} />
        ))}
      </section>

      {/* Charts Section */}
      <section className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Users by Role - Pie Chart */}
        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl transition-all group-hover:bg-violet-500/20" />

          <header className="relative flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
                Usuarios por rol
              </h3>
              <p className="text-xs text-white/50 mt-1">Total: {metrics.totals.users}</p>
            </div>
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
        </div>

        {/* Plans Distribution - Pie Chart */}
        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl transition-all group-hover:bg-emerald-500/20" />

          <header className="relative flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
                Planes activos
              </h3>
              <p className="text-xs text-white/50 mt-1">{metrics.planDistribution.length} tipos de plan</p>
            </div>
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
        </div>
      </section>

      {/* Subscription Status - Bar Chart */}
      <section className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl transition-all group-hover:bg-amber-500/20" />

        <header className="relative mb-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-zaltyko-accent-light">
            Estado de suscripciones
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Ingresos: {CURRENCY_FORMATTER.format(metrics.totals.revenue / 100)} · {metrics.totals.paidInvoices} facturas cobradas
          </p>
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
      </section>

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
            <div className="flex items-center gap-1.5 rounded-full bg-violet-500/20 px-3 py-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-xs font-semibold text-violet-300">+{chartDataset[chartDataset.length - 1]?.total - chartDataset[0]?.total || 0}</span>
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
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
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
                  stroke="#8B5CF6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorAcademias)"
                  dot={{ fill: "#8B5CF6", strokeWidth: 0, r: 4 }}
                  activeDot={{ fill: "#8B5CF6", strokeWidth: 2, stroke: "#fff", r: 6 }}
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
                  {initialEvents.map((event, idx) => (
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
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-medium text-violet-300">
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
        </section>
      )}
    </div>
  );
}

