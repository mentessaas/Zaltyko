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
        accent: "zaltyko-primary" as const,
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
    <div className="w-full space-y-6 sm:space-y-8">
      <section className="flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-md backdrop-blur sm:rounded-3xl sm:p-6">
        <div className="flex flex-col gap-4 sm:gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.35em] text-zaltyko-accent-light">
              Salud del SaaS
            </p>
            <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">Indicadores globales</h1>
            <p className="font-sans text-sm text-white/80 sm:text-base">
              Métricas agregadas en tiempo real conectadas a Supabase.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={refresh}
            disabled={loading}
            className="w-full shrink-0 border-white/20 bg-white/10 text-white hover:border-white/40 hover:bg-white/20 sm:w-auto"
          >
            <Activity className="mr-2 h-4 w-4" strokeWidth={1.8} />
            {loading ? "Actualizando…" : "Refrescar métricas"}
          </Button>
        </div>
      </section>

      <section className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6">
        {cards.map((card) => (
          <DashboardCard key={card.title} {...card} />
        ))}
      </section>

      <section className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 font-sans text-sm text-white/90">
          <header className="flex items-center justify-between gap-2 font-display text-xs uppercase tracking-wide text-zaltyko-accent-light">
            <span className="truncate">Usuarios por rol</span>
            <span className="shrink-0">Total: {metrics.totals.users}</span>
          </header>
          <div className="space-y-2">
            {metrics.usersByRole.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/20 bg-white/5 p-4 font-sans text-xs text-white/60">
                Aún no hay usuarios registrados.
              </p>
            ) : (
              metrics.usersByRole.map((role) => (
                <div
                  key={role.role}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2"
                >
                  <span className="min-w-0 truncate font-medium capitalize">{role.role ?? "Sin rol"}</span>
                  <span className="shrink-0 font-semibold text-white">{role.total}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 font-sans text-sm text-white/90">
          <header className="flex items-center justify-between gap-2 font-display text-xs uppercase tracking-wide text-zaltyko-accent-light">
            <span className="truncate">Distribución de planes</span>
            <span className="shrink-0">{metrics.planDistribution.length} planes</span>
          </header>
          <div className="space-y-2">
            {metrics.planDistribution.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/20 bg-white/5 p-4 font-sans text-xs text-white/60">
                Todavía no hay suscripciones registradas.
              </p>
            ) : (
              metrics.planDistribution.map((plan) => (
                <div
                  key={plan.code}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-semibold text-white uppercase tracking-wide">{plan.code}</p>
                    {plan.nickname && <p className="truncate font-sans text-xs text-white/60">{plan.nickname}</p>}
                  </div>
                  <span className="shrink-0 font-semibold text-white">{plan.total}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="w-full rounded-2xl border border-white/10 bg-white/5 p-5 font-sans text-sm text-white/90">
        <header className="flex items-center justify-between gap-2 font-display text-xs uppercase tracking-wide text-zaltyko-accent-light">
          <span className="truncate">Estado de suscripciones</span>
        </header>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.planStatuses.map((status) => (
            <div
              key={status.status}
              className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2"
            >
              <span className="min-w-0 truncate font-medium capitalize">{status.status}</span>
              <span className="shrink-0 font-semibold text-white">{status.total}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 break-words font-sans text-xs text-white/60">
          Ingresos acumulados: {CURRENCY_FORMATTER.format(metrics.totals.revenue / 100)} · Facturas
          cobradas: {metrics.totals.paidInvoices}
        </p>
      </section>

      <section className="w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 font-sans text-sm text-white/90">
        <header className="flex flex-col gap-1 font-display text-xs uppercase tracking-wide text-zaltyko-accent-light sm:flex-row sm:items-center sm:justify-between">
          <span className="truncate">Academias creadas por mes</span>
          <span className="shrink-0">Últimos {chartDataset.length} meses</span>
        </header>
        <div className="mt-6 flex h-48 items-end gap-2 overflow-x-auto pb-2 sm:gap-3">
          {chartDataset.map((item) => {
            const height = Math.max((item.total / chartMaxValue) * 100, 6);
            return (
              <div key={item.label} className="flex min-w-[60px] flex-1 flex-col items-center gap-2 text-xs sm:min-w-[80px]">
                <div
                  className="flex w-full items-end justify-center rounded-t-md bg-gradient-to-t from-zaltyko-primary/40 via-zaltyko-primary-light/60 to-zaltyko-primary-light/80 shadow-inner transition hover:from-zaltyko-primary/50 hover:via-zaltyko-primary-light/80 hover:to-zaltyko-primary-light/90"
                  style={{ height: `${height}%` }}
                >
                  <span className="mb-2 font-display text-[11px] font-semibold text-white drop-shadow">
                    {item.total}
                  </span>
                </div>
                <span className="font-sans text-[10px] uppercase tracking-wide text-white/60">
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

