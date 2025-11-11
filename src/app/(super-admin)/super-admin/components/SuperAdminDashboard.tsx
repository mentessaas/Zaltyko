"use client";

import { useMemo } from "react";
import {
  Activity,
  Building2,
  CreditCard,
  LayoutGrid,
  ShieldCheck,
  Users,
} from "lucide-react";

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import type { SuperAdminMetrics } from "@/lib/superAdminService";
import { useSuperAdminData } from "@/hooks/useSuperAdminData";
import { Button } from "@/components/ui/button";

interface SuperAdminDashboardProps {
  initialMetrics: SuperAdminMetrics;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function SuperAdminDashboard({ initialMetrics }: SuperAdminDashboardProps) {
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

  const cards = useMemo(
    () => [
      {
        title: "Academias",
        value: metrics.totals.academies,
        subtitle: "Total de academias registradas",
        href: "/super-admin/academies",
        icon: Building2,
        accent: "emerald" as const,
      },
      {
        title: "Usuarios",
        value: metrics.totals.users,
        subtitle: `Última alta: ${latestAcademyDate}`,
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
        accent: "emerald" as const,
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
    ],
    [metrics, latestAcademyDate, ownerCount, coachCount]
  );

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
              Salud del SaaS
            </p>
            <h1 className="text-3xl font-semibold text-white">Indicadores globales</h1>
            <p className="text-sm text-slate-300">
              Métricas agregadas en tiempo real conectadas a Supabase.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={refresh}
            disabled={loading}
            className="border-white/20 bg-white/10 text-slate-100 hover:border-white/40 hover:bg-white/20"
          >
            <Activity className="mr-2 h-4 w-4" strokeWidth={1.8} />
            {loading ? "Actualizando…" : "Refrescar métricas"}
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {cards.map((card) => (
          <DashboardCard key={card.title} {...card} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200">
          <header className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-300">
            <span>Usuarios por rol</span>
            <span>Total: {metrics.totals.users}</span>
          </header>
          <div className="space-y-2">
            {metrics.usersByRole.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/20 bg-white/5 p-4 text-xs text-slate-300">
                Aún no hay usuarios registrados.
              </p>
            ) : (
              metrics.usersByRole.map((role) => (
                <div
                  key={role.role}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3 py-2"
                >
                  <span className="font-medium capitalize">{role.role ?? "Sin rol"}</span>
                  <span className="font-semibold text-white">{role.total}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200">
          <header className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-300">
            <span>Distribución de planes</span>
            <span>{metrics.planDistribution.length} planes</span>
          </header>
          <div className="space-y-2">
            {metrics.planDistribution.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/20 bg-white/5 p-4 text-xs text-slate-300">
                Todavía no hay suscripciones registradas.
              </p>
            ) : (
              metrics.planDistribution.map((plan) => (
                <div
                  key={plan.code}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3 py-2"
                >
                  <div>
                    <p className="font-semibold text-white uppercase tracking-wide">{plan.code}</p>
                    {plan.nickname && <p className="text-xs text-slate-300">{plan.nickname}</p>}
                  </div>
                  <span className="font-semibold text-white">{plan.total}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200">
        <header className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-300">
          <span>Estado de suscripciones</span>
        </header>
        <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {metrics.planStatuses.map((status) => (
            <div
              key={status.status}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3 py-2"
            >
              <span className="font-medium capitalize">{status.status}</span>
              <span className="font-semibold text-white">{status.total}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Ingresos acumulados: {CURRENCY_FORMATTER.format(metrics.totals.revenue / 100)} · Facturas
          cobradas: {metrics.totals.paidInvoices}
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200">
        <header className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-300">
          <span>Academias creadas por mes</span>
          <span>Últimos {chartDataset.length} meses</span>
        </header>
        <div className="mt-6 flex h-48 items-end gap-3">
          {chartDataset.map((item) => {
            const height = Math.max((item.total / chartMaxValue) * 100, 6);
            return (
              <div key={item.label} className="flex flex-1 flex-col items-center gap-2 text-xs">
                <div
                  className="flex w-full items-end justify-center rounded-t-md bg-gradient-to-t from-sky-500/40 via-sky-400/60 to-sky-300/80 shadow-inner transition hover:from-sky-500/50 hover:via-sky-400/80 hover:to-sky-200/90"
                  style={{ height: `${height}%` }}
                >
                  <span className="mb-2 text-[11px] font-semibold text-white drop-shadow">
                    {item.total}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                  {item.label.slice(2).replace("-", "/")}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

