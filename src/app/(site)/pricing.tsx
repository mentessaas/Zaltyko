"use client";

import { useState } from "react";
import { Check, Shield, Clock, Globe2 } from "lucide-react";
import Link from "next/link";

import { PricingPageTracker } from "@/components/growth/PricingPageTracker";
import { TrackedPlanLink } from "@/components/growth/TrackedPlanLink";
import Reveal from "@/components/motion/Reveal";
import type { CommercialPlanSlug } from "@/lib/growth/contracts";
import { PRODUCT_PLANS, formatPlanAmount } from "@/lib/plans/catalog";

type Plan = {
  title: string;
  price: string;
  priceEurCents: number;
  description: string;
  cta: string;
  highlight: boolean;
  features: string[];
  ctaHref: string;
  planCode: CommercialPlanSlug;
  annualPriceEurCents?: number;
};

const plans: Plan[] = PRODUCT_PLANS.map((plan) => ({
  title: plan.publicName,
  price:
    plan.priceEurCents === 0
      ? "Incluido"
      : `${formatPlanAmount(plan.priceEurCents)}/mes`,
  priceEurCents: plan.priceEurCents,
  description: plan.description,
  cta: plan.cta,
  highlight: Boolean(plan.highlight),
  features: plan.features,
  ctaHref: plan.ctaHref,
  planCode:
    plan.code === "pro"
      ? "starter"
      : plan.code === "premium"
        ? "growth"
        : plan.code,
  annualPriceEurCents: plan.annualPriceEurCents,
}));

const euroAmountExact = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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
    description:
      "Un recorrido paso a paso para configurar la operación principal.",
  },
  {
    icon: Globe2,
    title: "Especializado en gimnasia",
    description: "Terminología y flujos para gimnasia artística y rítmica.",
  },
];

export default function PricingSection() {
  const [billingInterval, setBillingInterval] = useState<"month" | "year">(
    "month"
  );

  return (
    <section id="planes" className="py-20">
      <PricingPageTracker />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Trial banner */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-zaltyko-teal/25 bg-zaltyko-teal/10 px-5 py-2 text-sm font-medium text-zaltyko-navy">
            7 días de Starter sin tarjeta · una activación por academia cada 12
            meses
          </div>
        </div>

        <Reveal>
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-zaltyko-teal">
              Planes
            </span>
            <h1 className="mt-4 font-display text-3xl font-semibold text-foreground sm:text-4xl">
              Planes pensados por etapa de academia
            </h1>
            <p className="mt-3 font-sans text-base text-muted-foreground">
              No vendemos módulos sueltos: vendemos dirección diaria, cobros
              claros y seguimiento técnico para gimnasia artística y rítmica.
            </p>
            <p className="mt-2 font-sans text-sm text-muted-foreground">
              Empieza gratis y configura tu academia. Desde Facturación puedes
              activar 7 días de Starter sin tarjeta y, después, elegir Starter o
              Growth con pago mensual o anual. La prueba no genera cargos
              automáticos.
            </p>
          </div>
        </Reveal>

        <div className="mt-8 flex flex-col items-center gap-3">
          <div
            className="inline-flex rounded-full border border-border bg-muted/60 p-1"
            role="group"
            aria-label="Periodicidad de precios"
          >
            <button
              type="button"
              aria-pressed={billingInterval === "month"}
              onClick={() => setBillingInterval("month")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                billingInterval === "month"
                  ? "bg-zaltyko-teal text-white shadow-soft"
                  : "text-foreground hover:bg-background"
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              aria-pressed={billingInterval === "year"}
              onClick={() => setBillingInterval("year")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                billingInterval === "year"
                  ? "bg-zaltyko-teal text-white shadow-soft"
                  : "text-foreground hover:bg-background"
              }`}
            >
              Anual · ahorra 2 meses
            </button>
          </div>
          <p className="text-center font-sans text-sm text-muted-foreground">
            {billingInterval === "year"
              ? "Importe anual cobrado de una vez. Elige esta modalidad al contratar desde Facturación."
              : "Sin permanencia. Puedes cambiar a pago anual desde Facturación."}
          </p>
        </div>

        <div className="mt-8 grid items-center gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, index) => (
            <Reveal key={plan.title} delay={index * 80} className="h-full">
              <article
                className={`flex h-full flex-col rounded-card border bg-card p-8 transition-all duration-200 hover:-translate-y-1.5 hover:shadow-lift ${
                  plan.highlight
                    ? "border-zaltyko-mist border-b-[3px] border-b-zaltyko-teal"
                    : "border-zaltyko-mist"
                }`}
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-display text-xl font-semibold text-foreground">
                    {plan.title}
                  </h3>
                  {plan.highlight && (
                    <span className="text-xs font-semibold uppercase tracking-[0.06em] text-zaltyko-teal">
                      Más elegido
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  {billingInterval === "year" && plan.annualPriceEurCents ? (
                    <>
                      <p className="font-display text-3xl font-bold tabular-nums text-foreground">
                        {formatPlanAmount(plan.annualPriceEurCents)}
                        <span className="text-base font-medium">/año</span>
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {euroAmountExact.format(
                          plan.annualPriceEurCents / 12 / 100
                        )}
                        /mes equivalente · ahorras{" "}
                        {formatPlanAmount(plan.priceEurCents * 2)}/año
                      </p>
                    </>
                  ) : (
                    <p className="font-display text-3xl font-bold tabular-nums text-foreground">
                      {plan.price}
                    </p>
                  )}
                  {billingInterval === "year" &&
                    plan.planCode === "network" && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Periodicidad a confirmar en la propuesta multi-sede.
                      </p>
                    )}
                </div>
                <p className="mt-2 font-sans text-sm text-muted-foreground">
                  {plan.description}
                </p>

                <ul className="mt-6 space-y-3 font-sans text-sm text-foreground">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-zaltyko-teal" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <TrackedPlanLink
                  href={plan.ctaHref}
                  planCode={plan.planCode}
                  className={`mt-8 inline-flex min-h-11 items-center justify-center rounded-full px-6 py-2 text-sm font-semibold transition ${
                    plan.highlight
                      ? "bg-zaltyko-teal text-white hover:bg-zaltyko-primary-dark"
                      : "border border-zaltyko-mist text-foreground hover:bg-muted"
                  }`}
                >
                  {plan.cta}
                </TrackedPlanLink>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {commonBenefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <Reveal key={benefit.title} delay={index * 90}>
                <article className="h-full rounded-3xl border border-border bg-card p-6 shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zaltyko-accent/20 text-zaltyko-accent">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 font-sans text-sm text-muted-foreground">
                    {benefit.description}
                  </p>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal>
          <div className="mt-16 rounded-3xl border border-border bg-muted/50 p-8 text-center">
            <h3 className="font-display text-2xl font-semibold text-foreground">
              ¿Necesitas migrar datos o coordinar varias sedes?
            </h3>
            <p className="mt-3 font-sans text-sm text-slate-600">
              Empieza por tu cuenta. Si necesitas importar datos complejos o
              coordinar varias sedes, podemos orientarte por email.
            </p>
            <Link
              href="/contact?type=migracion"
              className="mt-6 inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Consultar una migración
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
