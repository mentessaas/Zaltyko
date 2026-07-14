import { Check, Shield, Clock, Globe2 } from "lucide-react";
import Link from "next/link";

import { PRODUCT_PLANS, formatPlanAmount } from "@/lib/plans/catalog";

type Plan = {
  title: string;
  price: string;
  description: string;
  cta: string;
  highlight: boolean;
  features: string[];
  ctaHref: string;
};

const plans: Plan[] = PRODUCT_PLANS.map((plan) => {
  return {
    title: plan.publicName,
    price: plan.priceEurCents === 0 ? "Incluido" : `${formatPlanAmount(plan.priceEurCents)}/mes`,
    description: plan.description,
    cta: plan.cta,
    highlight: Boolean(plan.highlight),
    features: plan.features,
    ctaHref: plan.ctaHref,
  };
});

const commonBenefits = [
  {
    icon: Shield,
    title: "Aislamiento por academia",
    description: "Controles de acceso y separación de datos por academia.",
  },
  {
    icon: Clock,
    title: "Puesta en marcha guiada",
    description: "Un recorrido paso a paso para configurar la operación principal.",
  },
  {
    icon: Globe2,
    title: "Especializado en gimnasia",
    description: "Terminología y flujos para gimnasia artística y rítmica.",
  },
];

export default function PricingSection() {
  return (
    <section id="planes" className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Trial banner */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-zaltyko-teal/25 bg-zaltyko-teal/10 px-5 py-2 text-sm font-medium text-zaltyko-navy">
            7 días de Starter sin tarjeta · una activación por academia cada 12 meses
          </div>
        </div>

        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-zaltyko-teal">
            Planes
          </span>
          <h2 className="mt-4 font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Planes pensados por etapa de academia
          </h2>
          <p className="mt-3 font-sans text-base text-muted-foreground">
            No vendemos módulos sueltos: vendemos dirección diaria, cobros claros y seguimiento técnico para gimnasia artística y rítmica.
          </p>
          <p className="mt-2 font-sans text-sm text-muted-foreground">
            Crea tu academia y activa la prueba desde Facturación. Después eliges si continúas; no se realiza ningún cargo automático.
          </p>
        </div>

        <div className="mt-8 grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article
              key={plan.title}
              className={`flex h-full flex-col rounded-card border bg-card p-8 ${
                plan.highlight
                  ? "border-zaltyko-mist border-b-[3px] border-b-zaltyko-teal"
                  : "border-zaltyko-mist"
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-display text-xl font-semibold text-foreground">{plan.title}</h3>
                {plan.highlight && (
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-zaltyko-teal">
                    Más elegido
                  </span>
                )}
              </div>
              <p className="font-display text-3xl font-bold tabular-nums text-foreground">{plan.price}</p>
              <p className="mt-2 font-sans text-sm text-muted-foreground">{plan.description}</p>

              <ul className="mt-6 space-y-3 font-sans text-sm text-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-zaltyko-teal" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaHref}
                className={`mt-8 inline-flex min-h-11 items-center justify-center rounded-xl px-6 py-2 text-sm font-semibold transition ${
                  plan.highlight
                    ? "bg-zaltyko-teal text-white hover:bg-primary-dark"
                    : "border border-zaltyko-mist text-foreground hover:bg-muted"
                }`}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {commonBenefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <article
                key={benefit.title}
                className="rounded-3xl border border-border bg-card p-6 shadow-lg"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zaltyko-accent/20 text-zaltyko-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{benefit.title}</h3>
                <p className="mt-2 font-sans text-sm text-muted-foreground">{benefit.description}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-16 rounded-3xl border border-border bg-muted/50 p-8 text-center">
          <h3 className="font-display text-2xl font-semibold text-foreground">
            ¿Necesitas migrar datos o coordinar varias sedes?
          </h3>
          <p className="mt-3 font-sans text-sm text-muted-foreground">
            Hacemos una sesión de diagnóstico y definimos una puesta en marcha para que tu equipo pueda operar sin fricción.
          </p>
          <Link
            href="/contact?type=migracion"
            className="mt-6 inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Hablar de migración
          </Link>
        </div>
      </div>
    </section>
  );
}
