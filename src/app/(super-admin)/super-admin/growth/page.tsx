import { ArrowRight, BadgeEuro, FlaskConical, Target, UsersRound } from "lucide-react";

import { CommercialInterviewWorkspace } from "@/components/growth/CommercialInterviewWorkspace";
import { getGrowthDashboardData } from "@/lib/growth/dashboard";

export const dynamic = "force-dynamic";

function rateLabel(rate: number | null) {
  return rate === null ? "— sin base" : `${rate}%`;
}

export default async function SuperAdminGrowthPage() {
  const data = await getGrowthDashboardData();
  const { metrics } = data;
  const interviewProgress = Math.min(
    100,
    Math.round((metrics.interviewsCompleted / metrics.interviewGoal) * 100)
  );

  const primaryMetrics = [
    {
      label: "Evidencia de entrevistas",
      value: `${metrics.interviewsCompleted}/${metrics.interviewGoal}`,
      detail: `${metrics.interviewsScheduled} programadas · objetivo: 10 academias distintas`,
      icon: UsersRound,
    },
    {
      label: "Trial → pago",
      value: rateLabel(metrics.trialToPaidRate),
      detail: `${metrics.trialsConverted} conversiones de ${metrics.trialsStarted} trials`,
      icon: FlaskConical,
    },
    {
      label: "Checkout → suscripción",
      value: rateLabel(metrics.checkoutToPaidRate),
      detail: `${metrics.paidSubscriptions} suscripciones Stripe de ${metrics.checkoutAcademies} academias con checkout`,
      icon: BadgeEuro,
    },
    {
      label: "Disposición a pagar",
      value: `${metrics.willingToPay}`,
      detail: `${metrics.betaInterested} entrevistas completadas con interés beta`,
      icon: Target,
    },
  ];

  const funnel = [
    ["Visitas pricing", metrics.pricingVisitors],
    ["Selección de plan", metrics.planSelectors],
    ["Contactos enviados", metrics.contactSubmitters],
    ["Leads", metrics.leads],
    ["Trials", metrics.trialsStarted],
    ["Checkout", metrics.checkoutAcademies],
    ["Pago Stripe", metrics.paidSubscriptions],
  ] as const;

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(37,211,184,0.18),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-6 sm:p-8">
        <div className="relative z-10 max-w-3xl">
          <p className="font-display text-xs uppercase tracking-[0.32em] text-zaltyko-electric">
            Fase 4 · validación comercial
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            De pricing publicado a evidencia de compra
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
            Fuente first-party para pricing, contacto, trial, checkout y suscripción. Las entrevistas
            solo cuentan cuando incluyen tamaño, herramientas, dolor, precio y objeción reales.
          </p>
        </div>
      </header>

      <section aria-labelledby="growth-kpis-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/65">Decisión semanal</p>
            <h2 id="growth-kpis-heading" className="mt-1 font-display text-xl font-semibold text-white">
              KPIs de salida de Fase 4
            </h2>
          </div>
          <p className="text-right text-xs text-white/65">Sin histórico suficiente: no se fija objetivo de conversión aún.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {primaryMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <article key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/10">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/50">{metric.label}</p>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zaltyko-electric/10 text-zaltyko-electric">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-5 font-display text-3xl font-semibold text-white">{metric.value}</p>
                <p className="mt-2 text-xs leading-5 text-white/50">{metric.detail}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/65">Funnel acumulado</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-white">Señales observables</h2>
            </div>
            <p className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">
              Plan → contacto: {rateLabel(metrics.intentToContactRate)}
            </p>
          </div>
          <ol className="mt-6 grid gap-2 sm:grid-cols-4 xl:grid-cols-7" aria-label="Funnel comercial">
            {funnel.map(([label, value], index) => (
              <li key={label} className="relative rounded-xl border border-white/10 bg-black/10 px-3 py-4">
                <p className="font-display text-2xl font-semibold text-white">{value}</p>
                <p className="mt-1 text-xs leading-4 text-white/50">{label}</p>
                {index < funnel.length - 1 && (
                  <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-zaltyko-electric/70 xl:block" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </article>

        <article className="rounded-2xl border border-zaltyko-teal/20 bg-zaltyko-teal/[0.07] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-zaltyko-electric">Criterio humano</p>
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl font-semibold text-white">10 academias distintas</h2>
            <span className="font-display text-lg text-white">{interviewProgress}%</span>
          </div>
          <progress
            className="mt-5 h-2 w-full overflow-hidden rounded-full accent-zaltyko-teal"
            max={100}
            value={interviewProgress}
            aria-label="Progreso de entrevistas completadas"
          />
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-white/65">Precio fácil medio</dt>
              <dd className="mt-1 font-semibold text-white">{metrics.averageEasyPriceEur === null ? "—" : `${metrics.averageEasyPriceEur} €`}</dd>
            </div>
            <div>
              <dt className="text-white/65">Precio límite medio</dt>
              <dd className="mt-1 font-semibold text-white">{metrics.averageLimitPriceEur === null ? "—" : `${metrics.averageLimitPriceEur} €`}</dd>
            </div>
          </dl>
        </article>
      </section>

      <CommercialInterviewWorkspace interviews={data.interviews} leads={data.leads} />
    </div>
  );
}
